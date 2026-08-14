import type { FreeRunner } from "./free-runners";
import { getBuddyVoiceSample, getBuddyVoiceProfile } from "./buddy-voice";
import { Client, handle_file } from "@gradio/client";

export type StudioCapability = string;
export type StudioJobInput = Record<string, unknown>;
export type StudioArtifact = { capability: StudioCapability; value: unknown; url?: string; provider?: string };

// Qwen's public ZeroGPU Space can exhaust its anonymous quota. Pocket TTS is a
// CPU-first alternative and exposes the same core capability: custom audio
// prompt -> cloned speech. Keep Qwen as a secondary fallback rather than the
// primary dependency for cloning.
const POCKET_TTS_SPACE = "https://nymbo-pocket-tts.hf.space";
const QWEN_TTS_SPACE = "https://qwen-qwen3-tts.hf.space";
const AUDIO_ORIGIN = POCKET_TTS_SPACE;

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

function audioUrl(value: unknown, origin = AUDIO_ORIGIN): string | undefined {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return new URL(value, origin).toString();
    return undefined;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) return URL.createObjectURL(value);
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as { url?: unknown; path?: unknown; data?: unknown };
  for (const field of [candidate.url, candidate.path]) {
    if (typeof field === "string") {
      if (/^https?:\/\//i.test(field)) return field;
      if (field.startsWith("/")) return new URL(field, origin).toString();
    }
  }
  if (typeof Blob !== "undefined" && candidate.data instanceof Blob) return URL.createObjectURL(candidate.data);
  return undefined;
}

async function connectSpace(space: string, label: string, onStatus?: (status: string) => void): Promise<Client> {
  onStatus?.(`Connecting to ${label}…`);
  return Client.connect(space);
}

async function runPocketVoiceClone(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  const text = inputText(input);
  if (!text) throw new Error("Buddy needs some text to speak.");
  const sample = await getBuddyVoiceSample();
  if (!sample) throw new Error("Record or upload a voice sample before using voice clone.");

  const client = await connectSpace(POCKET_TTS_SPACE, "Pocket TTS CPU voice engine", onStatus);
  onStatus?.("Cloning the speaker identity from your sample…");

  // Nymbo/Pocket-TTS exposes generate_speech with:
  // text, preset voice, custom audio, temperature, LSD steps, noise clamp,
  // EOS threshold and frames-after-EOS. Supplying custom audio activates
  // Pocket TTS zero-shot voice cloning.
  const result = await client.predict("/generate_speech", [
    text,
    "alba",
    handle_file(sample),
    0.7,
    1,
    0,
    -4,
    2,
  ]);
  const outputs = Array.isArray(result.data) ? result.data : [result.data];
  const output = outputs[0];
  const url = audioUrl(output);
  if (!url) throw new Error("Pocket TTS completed the clone request but returned unusable audio.");
  return { capability: "voice-clone", value: output, url, provider: "Pocket TTS CPU" };
}

async function runQwenVoiceClone(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  const text = inputText(input);
  if (!text) throw new Error("Buddy needs some text to speak.");
  const sample = await getBuddyVoiceSample();
  if (!sample) throw new Error("Record or upload a voice sample before using voice clone.");

  const profile = getBuddyVoiceProfile();
  const language = typeof input.language === "string" && input.language ? input.language : profile.language;
  const transcript = typeof input.referenceTranscript === "string" ? input.referenceTranscript.trim() : profile.referenceTranscript?.trim() || "";
  const useXVectorOnly = input.use_xvector_only === true ? true : !transcript;

  const client = await connectSpace(QWEN_TTS_SPACE, "Qwen fallback voice engine", onStatus);
  onStatus?.("Trying the Qwen fallback clone engine…");
  const result = await client.predict("/generate_voice_clone", [handle_file(sample), transcript, text, language, useXVectorOnly, "1.7B"]);
  const outputs = Array.isArray(result.data) ? result.data : [result.data];
  const output = outputs[0];
  const url = audioUrl(output, QWEN_TTS_SPACE);
  if (!url) throw new Error("Qwen completed the clone request but returned unusable audio.");
  return { capability: "voice-clone", value: output, url, provider: "Qwen3-TTS 1.7B Base" };
}

async function runVoiceClone(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  try {
    return await runPocketVoiceClone(input, onStatus);
  } catch (pocketError) {
    onStatus?.("Pocket TTS was unavailable; trying the Qwen fallback…");
    try {
      return await runQwenVoiceClone(input, onStatus);
    } catch (qwenError) {
      const pocketMessage = pocketError instanceof Error ? pocketError.message : String(pocketError);
      const qwenMessage = qwenError instanceof Error ? qwenError.message : String(qwenError);
      throw new Error(`Voice cloning is temporarily unavailable. Pocket TTS: ${pocketMessage}. Qwen fallback: ${qwenMessage}`);
    }
  }
}

async function runQwenPreset(input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  const text = inputText(input);
  if (!text) throw new Error("Buddy needs some text to speak.");
  const profile = getBuddyVoiceProfile();
  const language = typeof input.language === "string" && input.language ? input.language : profile.language;
  const speaker = typeof input.speaker === "string" && input.speaker ? input.speaker : profile.speaker;
  const instruct = typeof input.instruct === "string" ? input.instruct : [profile.mood, profile.tone].filter(Boolean).join(", ");
  const client = await connectSpace(QWEN_TTS_SPACE, "Qwen voice engine", onStatus);
  onStatus?.("Creating Buddy's selected voice…");
  const result = await client.predict("/generate_custom_voice", [text, language, speaker, instruct, "1.7B"]);
  const outputs = Array.isArray(result.data) ? result.data : [result.data];
  const output = outputs[0];
  const url = audioUrl(output, QWEN_TTS_SPACE);
  if (!url) throw new Error("Qwen completed the voice request but returned an unusable audio file.");
  return { capability: "tts", value: output, url, provider: "Qwen3-TTS 1.7B CustomVoice" };
}

export async function runStudioJob(capability: StudioCapability, input: StudioJobInput, onStatus?: (status: string) => void): Promise<StudioArtifact> {
  if (capability === "voice-clone" || capability === "voice-swap") return runVoiceClone(input, onStatus);
  if (capability === "tts" || capability === "voice") {
    return getBuddyVoiceProfile().mode === "clone" ? runVoiceClone(input, onStatus) : runQwenPreset(input, onStatus);
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
