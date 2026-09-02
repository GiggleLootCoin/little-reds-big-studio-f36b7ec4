import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified } from "./buddy-voice";
import { saveVoiceSample } from "./voice-profile";
import { normalizeAndVerifyBrowserAudio } from "./audio-artifact";
import { saveBuddyClonePreview } from "./buddy-voice";
import { createBestFreeVoiceClone } from "./real-voice-clone-v2";

export type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
export { runtimeProviders } from "./studio-runtime-impl";

const DEFAULT_CLONE_TEXT =
  "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";

export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    for (const key of [
      "text",
      "response",
      "generated_text",
      "transcription",
      "transcript",
      "content",
      "value",
      "data",
      "output",
      "result",
    ]) {
      const found = artifactText((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return "";
}

function cloneProfile() {
  return getBuddyVoiceProfile();
}

async function runVerifiedClone(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
  modelSize: "0.6B" | "1.7B" = "1.7B",
  persist = true,
) {
  let result;
  try {
    result = await createBestFreeVoiceClone(
      sample,
      refText,
      text,
      language,
      onStatus,
      modelSize,
      persist,
    );
  } catch (primaryError) {
    onStatus?.("Qwen voice generation was unavailable. Trying the free fallback…");
    try {
      const runtime = await import("./studio-runtime-impl");
      const fallback = await runtime.runStudioJob(
        "voice-clone",
        {
          refAudio: sample,
          referenceAudio: sample,
          audio: sample,
          refText,
          referenceTranscript: refText,
          target_text: text,
          text,
          language,
          _skipProviders: ["hf-qwen3-tts"],
        },
        onStatus,
      );
      if (!fallback.url) throw primaryError;
      const fallbackBlob = await fetch(fallback.url).then((response) => {
        if (!response.ok) throw new Error(`Fallback audio download failed (${response.status}).`);
        return response.blob();
      });
      const normalized = await normalizeAndVerifyBrowserAudio(fallbackBlob);
      if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
        throw new Error("Fallback clone returned silent or unusable audio.");
      if (persist) await saveBuddyClonePreview(normalized.blob, fallback.provider);
      result = {
        url: normalized.url,
        provider: fallback.provider,
        verification: `Free fallback ${fallback.provider} + browser audio decode + non-silent artifact verification`,
        duration: normalized.stats.duration,
        peak: normalized.stats.peak,
        rms: normalized.stats.rms,
      };
    } catch (fallbackError) {
      throw new Error(
        `Voice generation failed on Qwen and the free fallback. ${fallbackError instanceof Error ? fallbackError.message : String(primaryError)}`,
      );
    }
  }
  if (!result.url) throw new Error("The voice engine returned no playable audio.");
  if (persist) {
    await saveVoiceSample(sample, refText);
    await markBuddyCloneVerified(
      `${result.provider}${result.verification ? ` — ${result.verification}` : ""}`,
    );
  }
  return result;
}

async function prepareSpeechToText(input: StudioJobInput): Promise<StudioJobInput> {
  const audio = input.audio;
  if (!(audio instanceof Blob)) return input;
  try {
    return { ...input, audio: (await normalizeAndVerifyBrowserAudio(audio)).blob };
  } catch (error) {
    throw new Error(
      `The microphone recording could not be decoded. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function runStudioJob(
  capability: StudioCapability,
  input: StudioJobInput,
  onStatus?: (s: string) => void,
): Promise<StudioArtifact> {
  if (capability === "voice-clone") {
    const sample = input.refAudio ?? input.referenceAudio ?? input.audio;
    if (!(sample instanceof Blob))
      throw new Error("A reference voice recording is required for a real clone.");
    const refText = String(
      input.refText ??
        input.referenceText ??
        input.referenceTranscript ??
        cloneProfile().referenceTranscript ??
        DEFAULT_CLONE_TEXT,
    ).trim();
    const targetText =
      String(input.target_text ?? input.text ?? input.prompt ?? DEFAULT_CLONE_TEXT).trim() ||
      DEFAULT_CLONE_TEXT;
    const language = String(input.language ?? cloneProfile().language ?? "English");
    const modelSize = input.model_size === "1.7B" ? "1.7B" : "0.6B";
    onStatus?.(
      modelSize === "0.6B"
        ? "Using Buddy's fast voice mode…"
        : "Building the higher-quality voice clone…",
    );
    const result = await runVerifiedClone(
      sample,
      refText,
      targetText,
      language,
      onStatus,
      modelSize,
      true,
    );
    return { capability, value: result, url: result.url, provider: result.provider };
  }

  if (capability === "tts") {
    const profile = cloneProfile();
    const text = String(input.text ?? input.target_text ?? input.prompt ?? "").trim();
    if (!text) throw new Error("Voice text is empty.");
    const language = String(input.language ?? profile.language ?? "English");
    const modelSize = input.model_size === "1.7B" ? "1.7B" : "0.6B";

    const savedSample = await getBuddyVoiceSample();
    if (savedSample) {
      const refText = profile.referenceTranscript?.trim() || DEFAULT_CLONE_TEXT;
      onStatus?.("Speaking in Buddy's built-in Red voice…");
      const result = await runVerifiedClone(
        savedSample,
        refText,
        text,
        language,
        onStatus,
        modelSize,
        false,
      );
      return { capability: "tts", value: result, url: result.url, provider: result.provider };
    }

    if (profile.mode === "clone" && profile.cloneVerified) {
      throw new Error(
        "Buddy's saved voice sample is missing. Please restore the saved voice sample.",
      );
    }
  }

  const preparedInput = capability === "speech-to-text" ? await prepareSpeechToText(input) : input;
  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, preparedInput, onStatus);
}
