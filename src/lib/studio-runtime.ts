import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { createRealVoiceClone, speakWithRealVoiceClone } from "./real-voice-clone";
import { getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified } from "./buddy-voice";
import { getVoiceSample, getVoiceTranscript } from "./voice-profile";

export type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
export { runtimeProviders } from "./studio-runtime-impl";

export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    for (const k of [
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
      const t = artifactText((value as Record<string, unknown>)[k]);
      if (t) return t;
    }
  }
  return "";
}

function customVoiceSelected(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const profile = getBuddyVoiceProfile();
    return profile.mode === "clone" && profile.cloneVerified === true;
  } catch {
    return false;
  }
}

export async function runStudioJob(
  capability: StudioCapability,
  input: StudioJobInput,
  onStatus?: (s: string) => void,
): Promise<StudioArtifact> {
  if (capability === "voice-clone") {
    const sample = input.refAudio ?? input.referenceAudio ?? input.audio;
    if (!(sample instanceof Blob)) {
      throw new Error("A reference voice recording is required for a real clone.");
    }
    onStatus?.("Creating a real custom voice from the reference recording…");
    const refText = String(input.refText ?? input.referenceText ?? "").trim();
    if (!refText) {
      throw new Error("A verified transcript is required before the real clone can be generated.");
    }
    const result = await createRealVoiceClone(
      sample,
      refText,
      String(input.target_text ?? input.text ?? input.prompt ?? ""),
      String(input.language ?? "English"),
    );
    await markBuddyCloneVerified(result.provider);
    onStatus?.("Real custom voice generated, audio validated, and clone marked ready.");
    return {
      capability: "voice-clone",
      value: result,
      url: result.url,
      provider: result.provider,
    };
  }

  if (capability === "tts" && customVoiceSelected()) {
    const sample = await getVoiceSample();
    const refText = await getVoiceTranscript();
    if (!sample || !refText) {
      throw new Error("The verified custom voice reference is incomplete. Generate the clone again before using it.");
    }
    onStatus?.("Speaking with the verified custom voice…");
    const result = await speakWithRealVoiceClone(
      sample,
      refText,
      String(input.text ?? input.target_text ?? input.prompt ?? ""),
      String(input.language ?? "English"),
    );
    onStatus?.("Ready — Buddy used the verified custom voice.");
    return {
      capability: "tts",
      value: result,
      url: result.url,
      provider: result.provider,
    };
  }

  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, input, onStatus);
}
