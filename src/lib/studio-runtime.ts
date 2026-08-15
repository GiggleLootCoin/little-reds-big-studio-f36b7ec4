import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { createRealVoiceClone, speakWithRealVoiceClone } from "./real-voice-clone";
import { getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified } from "./buddy-voice";
import { saveVoiceSample } from "./voice-profile";

export type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
export { runtimeProviders } from "./studio-runtime-impl";

const DEFAULT_CLONE_TEXT =
  "Hi. I'm Buddy. This is my new voice. Let's make something brilliant together.";

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
    if (!(sample instanceof Blob))
      throw new Error("A reference voice recording is required for a real clone.");

    const refText = String(
      input.refText ?? input.referenceText ?? input.referenceTranscript ?? "",
    ).trim();
    const targetText =
      String(input.target_text ?? input.text ?? input.prompt ?? "").trim() || DEFAULT_CLONE_TEXT;
    const profile = getBuddyVoiceProfile();

    onStatus?.("Creating a real custom voice from your recording…");
    const result = await createRealVoiceClone(
      sample,
      refText,
      targetText,
      String(input.language ?? profile.language ?? "English"),
      String(input.mood ?? profile.mood ?? "natural"),
      String(input.tone ?? profile.tone ?? "conversational"),
      onStatus,
    );
    if (!result.url) throw new Error("The clone engine returned no playable audio.");

    await saveVoiceSample(sample, refText);
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
    const profile = getBuddyVoiceProfile();
    const sample = await getBuddyVoiceSample();
    if (!sample)
      throw new Error("The verified custom voice reference is missing. Generate the clone again.");
    onStatus?.("Speaking with the verified custom voice…");
    const result = await speakWithRealVoiceClone(
      sample,
      profile.referenceTranscript || "",
      String(input.text ?? input.target_text ?? input.prompt ?? ""),
      String(input.language ?? profile.language ?? "English"),
      String(input.mood ?? profile.mood ?? "natural"),
      String(input.tone ?? profile.tone ?? "conversational"),
      onStatus,
    );
    if (!result.url) throw new Error("The custom voice returned no playable audio.");
    onStatus?.("Ready — Buddy used the verified custom voice.");
    return { capability: "tts", value: result, url: result.url, provider: result.provider };
  }

  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, input, onStatus);
}
