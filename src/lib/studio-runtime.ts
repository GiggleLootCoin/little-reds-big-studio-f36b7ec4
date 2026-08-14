import { Client } from "@gradio/client";
import type { FreeRunner } from "./free-runners";
import { getBuddyVoiceSample, getBuddyVoiceProfile } from "./buddy-voice";

export type StudioCapability = string;
export type StudioJobInput = Record<string, unknown>;
export type StudioArtifact = { capability: StudioCapability; value: unknown; url?: string; provider?: string };

const QWEN_TTS_SPACE = "Qwen/Qwen3-TTS";

export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    for (const key of ["text", "response", "generated_text", "transcription", "transcript", "content", "value", "data", "output", "result"]) {
      const text = artifactText((value as Record<string, unknown>)[key]);
      if (text) return text;
    }
  }
  return "";
}

function inputText(input: StudioJobInput): string {
  for (const key of ["text", "prompt", "input", "message", "content"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function dataUrlToBlob(value: string): Promise<Blob | null> {
  const match = value.match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] || "audio/wav" });
}

async function resolveAudio(value: unknown): Promise<Blob | string | null> {
  if (value instanceof Blob) return value;
  if (typeof value === "string") {
    if (value.startsWith("data:")) return (await dataUrlToBlob(value)) || value;
    if (/^https?:\/\//.test(value)) return value;
  }
  if (value && typeof value === "object") {
    const candidate = value as { url?: unknown; path?: unknown; data?: unknown };
    if (typeof candidate.url === "string") return candidate.url;
    if (typeof candidate.path === "string") return candidate.path;
    if (candidate.data instanceof Blob) return candidate.data;
  }
  return null;
}

async function runQwenVoiceClone(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  const text = inputText(input);
  if (!text) throw new Error("Buddy needs some text to speak.");
  const sample = await getBuddyVoiceSample();
  if (!sample) throw new Error("Record or upload a voice sample before using voice clone.");

  const profile = getBuddyVoiceProfile();
  const language = typeof input.language === "string" && input.language ? input.language : profile.language;
  const transcript = typeof input.referenceTranscript === "string" ? input.referenceTranscript : "";

  onStatus?.("Connecting to Buddy's voice engine…");
  const client = await Client.connect(QWEN_TTS_SPACE);
  onStatus?.("Creating the voice clone…");

  let lastError: unknown = null;
  for (const args of [
    [sample, transcript, text, language, true, 1.7],
    [sample, transcript, text, language, true],
    [sample, transcript, text, language],
  ]) {
    try {
      const result = await client.predict("/generate_voice_clone", args);
      const outputs = Array.isArray(result.data) ? result.data : [result.data];
      const audio = await resolveAudio(outputs[0]);
      if (audio) return { capability: "tts", value: audio, url: typeof audio === "string" ? audio : undefined, provider: "Qwen3-TTS" };
      lastError = new Error("Qwen returned no playable audio artifact.");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Buddy's voice clone service did not return audio.");
}

async function runQwenPreset(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  const text = inputText(input);
  if (!text) throw new Error("Buddy needs some text to speak.");
  const profile = getBuddyVoiceProfile();
  const language = typeof input.language === "string" && input.language ? input.language : profile.language;
  const speaker = typeof input.speaker === "string" && input.speaker ? input.speaker : profile.speaker;
  onStatus?.("Creating Buddy's voice…");
  const client = await Client.connect(QWEN_TTS_SPACE);
  const result = await client.predict("/generate_custom_voice", [text, language, speaker, "", 1.7]);
  const outputs = Array.isArray(result.data) ? result.data : [result.data];
  const audio = await resolveAudio(outputs[0]);
  if (!audio) throw new Error("Qwen returned no playable audio artifact.");
  return { capability: "tts", value: audio, url: typeof audio === "string" ? audio : undefined, provider: "Qwen3-TTS" };
}

export async function runStudioJob(capability: StudioCapability, input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  if (capability === "voice-clone" || capability === "voice-swap") return runQwenVoiceClone(input, onStatus);
  if (capability === "tts" || capability === "voice") {
    return getBuddyVoiceProfile().mode === "clone" ? runQwenVoiceClone(input, onStatus) : runQwenPreset(input, onStatus);
  }

  const url = typeof input.url === "string" ? input.url : "/api/ai/chat";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Studio generation failed (${response.status}).`);
  return { capability, value: await response.json(), provider: "Studio server route" };
}

export function runtimeProviders(_capability?: StudioCapability): FreeRunner[] {
  return [];
}
