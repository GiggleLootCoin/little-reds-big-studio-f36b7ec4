import { Client, handle_file } from "@gradio/client";
import { normalizeAndVerifyBrowserAudio } from "./audio-artifact";
import { saveBuddyClonePreview } from "./buddy-voice";

const SPACE_ID = "Qwen/Qwen3-TTS";
const MODEL_SIZE = "0.6B";
const REQUEST_TIMEOUT_MS = 150_000;
const TARGET_MAX_CHARS = 1000;

export type QwenCloneResult = {
  url: string;
  provider: string;
  verification: string;
  duration: number;
  peak: number;
  rms: number;
};

type GradioResult = { data?: unknown[] } | unknown[] | unknown;

function unwrap(value: GradioResult): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown[] }).data))
    return (value as { data: unknown[] }).data;
  return [value];
}

function isAudioTuple(value: unknown): value is [number, unknown] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0])
  );
}

function numericSamples(value: unknown): number[] | null {
  if (
    value instanceof Float32Array ||
    value instanceof Float64Array ||
    value instanceof Int16Array
  )
    return Array.from(value);
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  )
    return value as number[];
  return null;
}

function encodePcm16Wav(sampleRate: number, samples: number[]): Blob {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const n = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate * 2), true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
  return new Blob([buffer], { type: "audio/wav" });
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error(`[qwen-timeout] ${label} exceeded ${REQUEST_TIMEOUT_MS / 1000}s.`)),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

async function connectQwen(): Promise<Client> {
  const sources = [
    SPACE_ID,
    `${window.location.origin}/api/hf-space/${encodeURIComponent(SPACE_ID)}`,
  ];
  let last: unknown;
  for (const source of sources) {
    try {
      return await withTimeout(
        Client.connect(source, { status_callback: () => undefined }),
        `connect ${SPACE_ID}`,
      );
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("Could not connect to the official Qwen3-TTS service.");
}

async function resultToBlob(result: GradioResult): Promise<Blob> {
  const values = unwrap(result);
  const audio = values.find((value) => {
    if (value instanceof Blob) return value.size > 0;
    if (isAudioTuple(value)) return numericSamples(value[1])?.length;
    if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      return o.url || o.path || o.data || o.audio || o.value;
    }
    return false;
  });

  if (audio instanceof Blob) {
    if (!audio.size) throw new Error("Qwen returned an empty audio file.");
    return audio;
  }

  if (isAudioTuple(audio)) {
    const samples = numericSamples(audio[1]);
    if (!samples?.length) throw new Error("Qwen returned an empty waveform.");
    return encodePcm16Wav(audio[0], samples);
  }

  if (audio && typeof audio === "object") {
    const o = audio as Record<string, unknown>;
    const nested = o.data ?? o.audio ?? o.value;
    if (isAudioTuple(nested)) {
      const samples = numericSamples(nested[1]);
      if (!samples?.length) throw new Error("Qwen returned an empty waveform.");
      return encodePcm16Wav(nested[0], samples);
    }
    const source = o.url ?? o.path;
    if (typeof source === "string" && source) {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Qwen audio download failed (${response.status}).`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("Qwen returned an empty audio artifact.");
      return blob;
    }
  }

  throw new Error("Qwen returned no playable cloned audio.");
}

export async function createQwen3TTSClone(
  sample: Blob,
  refText: string,
  text: string,
  onStatus?: (status: string) => void,
): Promise<QwenCloneResult> {
  if (!(sample instanceof Blob) || !sample.size)
    throw new Error("Your reference recording is empty or unavailable.");
  if (!refText.trim())
    throw new Error("The exact reference transcript is required for Qwen3-TTS cloning.");
  if (!text.trim()) throw new Error("Voice clone target text is empty.");

  const targetText = text.trim().slice(0, TARGET_MAX_CHARS);
  onStatus?.("Connecting to the official Qwen3-TTS voice-cloning service…");
  const client = await connectQwen();

  onStatus?.("Sending your actual reference recording and its transcript to Qwen3-TTS…");
  const reference = await handle_file(sample);
  const response = await withTimeout(
    client.predict("/generate_voice_clone", [
      reference,
      refText.trim(),
      targetText,
      "English",
      false,
      MODEL_SIZE,
    ]),
    "Qwen3-TTS voice cloning",
  );

  onStatus?.("Qwen3-TTS returned audio. Verifying that it is real, non-silent, and playable on Android…");
  const generated = await resultToBlob(response);
  const normalized = await normalizeAndVerifyBrowserAudio(generated);
  if (
    normalized.stats.duration <= 0 ||
    normalized.stats.peak <= 0 ||
    normalized.stats.rms <= 0
  ) {
    URL.revokeObjectURL(normalized.url);
    throw new Error("Qwen3-TTS returned silent or unusable audio.");
  }

  const provider = `Qwen3-TTS ${MODEL_SIZE} Base — official Qwen ZeroGPU`;
  await saveBuddyClonePreview(normalized.blob, provider);
  onStatus?.(
    `Qwen clone verified: ${normalized.stats.duration.toFixed(2)}s, peak ${normalized.stats.peak.toFixed(3)}, RMS ${normalized.stats.rms.toFixed(4)}.`,
  );

  return {
    url: normalized.url,
    provider,
    verification:
      "official Qwen3-TTS Base reference-audio + exact-transcript conditioning, decoded WAV, non-silent artifact, and Android audio-element verification",
    duration: normalized.stats.duration,
    peak: normalized.stats.peak,
    rms: normalized.stats.rms,
  };
}
