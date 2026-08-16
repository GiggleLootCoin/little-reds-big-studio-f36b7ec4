import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified } from "./buddy-voice";
import { saveVoiceSample } from "./voice-profile";
import { createBestFreeVoiceClone } from "./real-voice-clone-v2";

export type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
export { runtimeProviders } from "./studio-runtime-impl";

const DEFAULT_CLONE_TEXT = "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";

export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    for (const key of ["text", "response", "generated_text", "transcription", "transcript", "content", "value", "data", "output", "result"]) {
      const found = artifactText((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return "";
}

function cloneProfile() { return getBuddyVoiceProfile(); }

async function runVerifiedClone(sample: Blob, refText: string, text: string, onStatus?: (s: string) => void) {
  const result = await createBestFreeVoiceClone(sample, refText, text, onStatus);
  if (!result.url) throw new Error("The voice engine returned no playable audio.");
  await saveVoiceSample(sample, refText);
  await markBuddyCloneVerified(`${result.provider}${result.verification ? ` — ${result.verification}` : ""}`);
  return result;
}

export async function runStudioJob(capability: StudioCapability, input: StudioJobInput, onStatus?: (s: string) => void): Promise<StudioArtifact> {
  if (capability === "voice-clone") {
    const sample = input.refAudio ?? input.referenceAudio ?? input.audio;
    if (!(sample instanceof Blob)) throw new Error("A reference voice recording is required for a real clone.");
    const refText = String(input.refText ?? input.referenceText ?? input.referenceTranscript ?? cloneProfile().referenceTranscript ?? DEFAULT_CLONE_TEXT).trim();
    const targetText = String(input.target_text ?? input.text ?? input.prompt ?? DEFAULT_CLONE_TEXT).trim() || DEFAULT_CLONE_TEXT;
    onStatus?.("Building your voice from the actual reference recording — no preset speaker is being used.");
    const result = await runVerifiedClone(sample, refText, targetText, onStatus);
    onStatus?.("Your reference-conditioned voice produced playable audio.");
    return { capability, value: result, url: result.url, provider: result.provider };
  }

  if (capability === "tts") {
    const profile = cloneProfile();
    if (profile.mode === "clone" && profile.cloneVerified) {
      const sample = await getBuddyVoiceSample();
      if (!sample) throw new Error("The saved custom voice sample is missing. Please create the clone again.");
      const refText = profile.referenceTranscript?.trim() || DEFAULT_CLONE_TEXT;
      const text = String(input.text ?? input.target_text ?? input.prompt ?? "").trim();
      if (!text) throw new Error("Voice text is empty.");
      onStatus?.("Generating Buddy speech from your saved reference voice…");
      const result = await runVerifiedClone(sample, refText, text, onStatus);
      return { capability: "tts", value: result, url: result.url, provider: result.provider };
    }
  }

  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, input, onStatus);
}
