import { Client, handle_file } from "@gradio/client";

export type RealCloneResult = { url: string; provider: string; voiceId?: string };

const CHATTERBOX_SPACE = "ResembleAI/Chatterbox";
const DEFAULT_CLONE_TEXT =
  "Hi. I'm Buddy. This is a voice clone test. The voice you supplied is speaking these words.";

function validateAudioBlob(blob: Blob): void {
  if (!blob.size) throw new Error("The clone engine returned empty audio.");
  if (blob.size < 4096) throw new Error("The clone engine returned an unusably small audio file.");
  if (blob.type && !blob.type.toLowerCase().startsWith("audio/")) {
    throw new Error(`The clone engine returned ${blob.type}, not audio.`);
  }
}

function audioTupleToWav(sampleRate: number, raw: unknown): Blob {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("The clone engine returned an invalid audio sample rate.");
  }

  let samples: Float32Array | Int16Array;
  if (raw instanceof Float32Array) samples = raw;
  else if (raw instanceof Int16Array) samples = raw;
  else if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    if (view.byteLength === 0) throw new Error("The clone engine returned empty waveform data.");
    if (view.byteLength % 2 !== 0) throw new Error("The clone engine returned malformed waveform data.");
    samples = new Int16Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  } else if (Array.isArray(raw)) samples = Float32Array.from(raw.map(Number));
  else throw new Error("The clone engine returned waveform data in an unsupported format.");

  if (!samples.length) throw new Error("The clone engine returned no waveform samples.");
  const pcm = new Int16Array(samples.length);
  if (samples instanceof Int16Array) pcm.set(samples);
  else {
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(Number(value)));
    for (let i = 0; i < samples.length; i += 1) {
      const value = Number(samples[i]);
      const normalized = peak > 1 ? value / 32768 : value;
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(normalized * 32767)));
    }
  }

  const dataBytes = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate) * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

async function outputToBlob(value: unknown): Promise<Blob> {
  if (value instanceof Blob) return value;
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number") {
    return audioTupleToWav(value[0], value[1]);
  }
  if (typeof value === "string" && /^(https?:|blob:|data:)/i.test(value)) {
    const response = await fetch(value, { cache: "no-store" });
    if (!response.ok) throw new Error(`Generated audio download failed (${response.status}).`);
    return response.blob();
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.url === "string") return outputToBlob(object.url);
    if (typeof object.path === "string") {
      if (/^(https?:|blob:|data:)/i.test(object.path)) return outputToBlob(object.path);
      const path = object.path.replace(/^\/+/, "");
      return outputToBlob(`https://resembleai-chatterbox.hf.space/file=${encodeURIComponent(path)}`);
    }
    for (const key of ["data", "value", "output", "result"]) {
      if (object[key] !== undefined) {
        try {
          return await outputToBlob(object[key]);
        } catch {
          // Try the next representation.
        }
      }
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        return await outputToBlob(item);
      } catch {
        // Try the next output.
      }
    }
  }
  throw new Error("The clone engine returned no downloadable audio artifact.");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateWithChatterbox(reference: Blob, text: string): Promise<Blob> {
  if (reference.size < 4096) throw new Error("The reference recording is too small to clone.");

  const client = await withTimeout(
    Client.connect(CHATTERBOX_SPACE),
    30000,
    "Connecting to Chatterbox",
  );

  const payload = {
    text_input: text.slice(0, 300),
    audio_prompt_path_input: handle_file(reference),
    exaggeration_input: 0.5,
    temperature_input: 0.8,
    seed_num_input: 0,
    cfgw_input: 0.5,
    vad_trim_input: false,
  };

  // Chatterbox is a queued ZeroGPU function. Gradio's predict() waits for the
  // completed result and propagates queue errors; the previous manual iterator
  // could leave the UI waiting forever when the queue failed before a data event.
  try {
    const response = await withTimeout(
      client.predict("/generate_tts_audio", payload),
      180000,
      "Chatterbox voice clone generation",
    );
    const blob = await outputToBlob(response?.data);
    validateAudioBlob(blob);
    return blob;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Chatterbox could not generate the clone: ${message}`);
  }
}

export async function createRealVoiceClone(
  reference: Blob,
  _refText = "",
  text = DEFAULT_CLONE_TEXT,
  _language = "English",
): Promise<RealCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  const blob = await generateWithChatterbox(reference, text.trim() || DEFAULT_CLONE_TEXT);
  return { url: URL.createObjectURL(blob), provider: "Chatterbox — Resemble AI voice clone" };
}

export async function speakWithRealVoiceClone(
  reference: Blob,
  refText = "",
  text = DEFAULT_CLONE_TEXT,
  language = "English",
): Promise<RealCloneResult> {
  return createRealVoiceClone(reference, refText, text, language);
}
