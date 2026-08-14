import { Client, handle_file } from "@gradio/client";
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
  for (const key of ["text", "prompt", "input", "message", "content", "target_text"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function audioUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as { url?: unknown; path?: unknown };
  if (typeof candidate.url === "string" && /^https?:\/\//.test(candidate.url)) return candidate.url;
  if (typeof candidate.path === "string" && /^https?:\/\//.test(candidate.path)) return candidate.path;
  return undefined;
}

async function runQwenVoiceClone(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  const text = inputText(input);
  if (!text) throw new Error("Buddy needs some text to speak.");
  const sample = await getBuddyVoiceSample();
  if (!sample) throw new Error("Record or upload a voice sample before using voice clone.");

  const profile = getBuddyVoiceProfile();
  const language = typeof input.language === "string" && input.language ? input.language : profile.language;
  const transcript = typeof input.referenceTranscript === "string" ? input.referenceTranscript.trim() : profile.referenceTranscript?.trim() || "";
  const useXVectorOnly = input.use_xvector_only === true || !transcript;

  onStatus?.("Connecting to Qwen's free voice-clone engine…");
  const client = await Client.connect(QWEN_TTS_SPACE, {
    status_callback: (status) => {
      if (status.status === "sleeping" || status.status === "building") onStatus?.("Waking the free voice engine…");
    },
  });
  onStatus?.(useXVectorOnly ? "Cloning the speaker identity from your sample…" : "Cloning your voice with the sample and transcript…");

  const result = await client.predict("/generate_voice_clone", [
    handle_file(sample),
    transcript,
    text,
    language,
    useXVectorOnly,
    "1.7B",
  ]);
  const outputs = Array.isArray(result.data) ? result.data : [result.data];
  const output = outputs[0];
  const url = audioUrl(output);
  if (!url) throw new Error("Qwen completed the clone request but did not return playable audio.");
  return { capability: "voice-clone", value: output, url, provider: "Qwen3-TTS 1.7B Base" };
}

async function runQwenPreset(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  const text = inputText(input);
  if (!text) throw new Error("Buddy needs some text to speak.");
  const profile = getBuddyVoiceProfile();
  const language = typeof input.language === "string" && input.language ? input.language : profile.language;
  const speaker = typeof input.speaker === "string" && input.speaker ? input.speaker : profile.speaker;
  const instruct = typeof input.instruct === "string" ? input.instruct : [profile.mood, profile.tone].filter(Boolean).join(", ");
  onStatus?.("Creating Buddy's selected voice…");
  const client = await Client.connect(QWEN_TTS_SPACE);
  const result = await client.predict("/generate_custom_voice", [text, language, speaker, instruct, "1.7B"]);
  const outputs = Array.isArray(result.data) ? result.data : [result.data];
  const output = outputs[0];
  const url = audioUrl(output);
  if (!url) throw new Error("Qwen completed the voice request but did not return playable audio.");
  return { capability: "tts", value: output, url, provider: "Qwen3-TTS 1.7B CustomVoice" };
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
