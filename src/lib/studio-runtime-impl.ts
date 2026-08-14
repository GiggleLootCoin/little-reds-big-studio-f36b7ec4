import { Client, handle_file } from "@gradio/client";
import type { StudioArtifact, StudioJobInput } from "./studio-runtime";

const QWEN_TTS_SPACE = "Qwen/Qwen3-TTS";
const MODEL_SIZE = "1.7B";

type AudioValue = { url?: unknown; path?: unknown };

function audioUrl(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return undefined;
  const audio = value as AudioValue;
  if (typeof audio.url === "string") return audio.url;
  if (typeof audio.path === "string" && /^https?:\/\//.test(audio.path)) return audio.path;
  return undefined;
}

function normalizeLanguage(language: unknown): string {
  const value = String(language ?? "Auto");
  return value === "Auto" ? "Auto" : value;
}

export async function runStudioJob(
  capability: string,
  input: StudioJobInput,
  onStatus?: (status: string) => void,
): Promise<StudioArtifact> {
  if (capability !== "voice-clone" && capability !== "tts") {
    throw new Error(`No free runtime is configured for ${capability}.`);
  }

  onStatus?.(
    capability === "voice-clone"
      ? "Connecting to the free voice-clone engine…"
      : "Connecting to the free voice engine…",
  );
  const client = await Client.connect(QWEN_TTS_SPACE);

  if (capability === "voice-clone") {
    if (!(input.refAudio instanceof Blob)) {
      throw new Error("Record or upload a voice sample first.");
    }
    const targetText = String(input.target_text ?? input.text ?? "").trim();
    if (!targetText) throw new Error("Target text is required.");

    onStatus?.("Sending your authorized voice sample to the clone engine…");
    const refAudio = await handle_file(input.refAudio);
    const result = await client.predict("/generate_voice_clone", {
      ref_audio: refAudio,
      ref_text: input.ref_text ? String(input.ref_text) : "",
      target_text: targetText,
      language: normalizeLanguage(input.language),
      use_xvector_only: input.use_xvector_only !== false,
      model_size: MODEL_SIZE,
    });

    const output = Array.isArray(result.data) ? result.data[0] : result.data;
    const url = audioUrl(output);
    if (!url) {
      throw new Error("The clone engine completed without returning playable audio.");
    }
    return { capability, value: output, url, provider: "Qwen3-TTS Voice Clone" };
  }

  const text = String(input.text ?? input.target_text ?? "").trim();
  if (!text) throw new Error("Text is required.");
  onStatus?.("Generating Buddy's voice preview…");
  const result = await client.predict("/generate_custom_voice", {
    text,
    language: normalizeLanguage(input.language),
    speaker: String(input.speaker ?? "Ryan"),
    instruct: [input.mood, input.tone].filter(Boolean).join(", "),
    model_size: MODEL_SIZE,
  });
  const output = Array.isArray(result.data) ? result.data[0] : result.data;
  const url = audioUrl(output);
  if (!url) {
    throw new Error("The voice engine completed without returning playable audio.");
  }
  return { capability, value: output, url, provider: "Qwen3-TTS CustomVoice" };
}
