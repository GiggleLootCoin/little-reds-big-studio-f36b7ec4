import { Client, handle_file } from "@gradio/client";

export type RealCloneResult = {
  url: string;
  provider: string;
  voiceId?: string;
};

const QWEN_SPACE = "Qwen/Qwen3-TTS";
const QWEN_CLONE_ENDPOINT = "/generate_voice_clone";
const QWEN_LANGUAGES = new Set([
  "Auto",
  "Chinese",
  "English",
  "Japanese",
  "Korean",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Russian",
]);

function cloneLanguage(value: string): string {
  const normalized = value.trim();
  return QWEN_LANGUAGES.has(normalized) ? normalized : "Auto";
}

function numericSamples(value: unknown): number[] | null {
  if (value instanceof Float32Array || value instanceof Float64Array || value instanceof Int16Array) {
    return Array.from(value, Number);
  }
  if (Array.isArray(value) && value.length && value.every((x) => typeof x === "number" && Number.isFinite(x))) {
    return value as number[];
  }
  return null;
}

function samplesToWav(sampleRate: number, samples: number[]): Blob {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const n = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
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

async function outputToBlob(output: unknown): Promise<Blob> {
  if (output instanceof Blob) return output;

  if (Array.isArray(output) && output.length >= 2 && typeof output[0] === "number") {
    const samples = numericSamples(output[1]);
    if (samples) return samplesToWav(output[0], samples);
  }

  if (typeof output === "string" && /^https?:\/\//i.test(output)) {
    const response = await fetch(output);
    if (!response.ok) throw new Error(`The clone audio could not be downloaded (${response.status}).`);
    return response.blob();
  }

  if (output && typeof output === "object") {
    const file = output as Record<string, unknown>;
    const nested = file.data;
    if (nested && nested !== output) {
      try {
        return await outputToBlob(nested);
      } catch {
        /* continue to URL/path handling */
      }
    }
    const url = typeof file.url === "string" ? file.url : undefined;
    if (url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`The clone audio could not be downloaded (${response.status}).`);
      return response.blob();
    }
    const path = typeof file.path === "string" ? file.path : undefined;
    if (path && /^https?:\/\//i.test(path)) {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`The clone audio could not be downloaded (${response.status}).`);
      return response.blob();
    }
  }

  throw new Error("Qwen returned no downloadable clone audio artifact.");
}

async function generateWithQwen(
  reference: Blob,
  refText: string,
  text: string,
  language: string,
): Promise<Blob> {
  const app = await Client.connect(QWEN_SPACE, { status_callback: () => undefined });
  const result = await app.predict(QWEN_CLONE_ENDPOINT, [
    handle_file(reference),
    refText.trim(),
    text.trim(),
    cloneLanguage(language),
    false,
    "1.7B",
  ]);

  const data = (result as { data?: unknown[] }).data;
  if (!Array.isArray(data) || !data[0]) {
    throw new Error("Qwen completed without returning clone audio.");
  }

  return outputToBlob(data[0]);
}

function validateGeneratedAudio(blob: Blob): void {
  if (!blob.size) throw new Error("The clone engine returned an empty audio artifact.");
  const type = blob.type.toLowerCase();
  if (type && !type.startsWith("audio/")) {
    throw new Error(`The clone engine returned an unexpected artifact type: ${blob.type}.`);
  }
  if (blob.size < 4096) {
    throw new Error("The clone engine returned an audio artifact that is too small to be a usable voice sample.");
  }
}

export async function createRealVoiceClone(
  reference: Blob,
  refText: string,
  text: string,
  language = "English",
): Promise<RealCloneResult> {
  if (reference.size === 0) throw new Error("The voice recording is empty.");
  if (!refText.trim()) {
    throw new Error(
      "Add the exact words spoken in the reference recording. Qwen uses that transcript for its highest-quality clone mode.",
    );
  }
  if (!text.trim()) throw new Error("Target speech text is empty.");

  const blob = await generateWithQwen(reference, refText, text, language);
  validateGeneratedAudio(blob);

  return {
    url: URL.createObjectURL(blob),
    provider: "Qwen3-TTS Base 1.7B",
  };
}

export async function speakWithRealVoiceClone(
  reference: Blob,
  refText: string,
  text: string,
  language = "English",
): Promise<RealCloneResult> {
  return createRealVoiceClone(reference, refText, text, language);
}
