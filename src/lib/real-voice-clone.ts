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
  if (QWEN_LANGUAGES.has(normalized)) return normalized;
  return "Auto";
}

async function outputToBlob(output: unknown): Promise<Blob> {
  if (output instanceof Blob) return output;

  if (typeof output === "string" && /^https?:\/\//i.test(output)) {
    const response = await fetch(output);
    if (!response.ok) throw new Error(`The clone audio could not be downloaded (${response.status}).`);
    return response.blob();
  }

  if (output && typeof output === "object") {
    const file = output as Record<string, unknown>;
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
  const app = await Client.connect(QWEN_SPACE);
  const result = await app.predict(QWEN_CLONE_ENDPOINT, [
    handle_file(reference),
    refText.trim(),
    text.trim(),
    cloneLanguage(language),
    false,
    "1.7B",
  ]);

  if (!Array.isArray(result.data) || !result.data[0]) {
    throw new Error("Qwen completed without returning clone audio.");
  }

  return outputToBlob(result.data[0]);
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
