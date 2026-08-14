import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { createRealVoiceClone, speakWithRealVoiceClone } from "./real-voice-clone";
import { getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified } from "./buddy-voice";
import { saveVoiceSample } from "./voice-profile";

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
    const targetText = String(input.target_text ?? input.text ?? input.prompt ?? "").trim();
    if (!targetText) throw new Error("Target speech text is empty.");

    let result: StudioArtifact;
    try {
      const qwen = await createRealVoiceClone(
        sample,
        refText,
        targetText,
        String(input.language ?? "English"),
      );
      result = {
        capability: "voice-clone",
        value: qwen,
        url: qwen.url,
        provider: qwen.provider,
      };
    } catch (qwenError) {
      // Qwen is the preferred high-fidelity route. If its public Space is busy or
      // temporarily unavailable, use the validated Hugging Face clone pool instead
      // of pretending a failed clone succeeded or falling back to a generic TTS voice.
      onStatus?.("Qwen is busy; trying the verified multilingual clone fallback…");
      const mod = await import("./studio-runtime-impl");
      try {
        result = await mod.runStudioJob(
          "voice-clone",
          { ...input, refText, referenceTranscript: refText, target_text: targetText },
          onStatus,
        );
      } catch (fallbackError) {
        const first = qwenError instanceof Error ? qwenError.message : "Qwen clone failed.";
        const second =
          fallbackError instanceof Error ? fallbackError.message : "Clone fallback failed.";
        throw new Error(`${first} ${second}`);
      }
    }

    if (!result.url) throw new Error("The clone engine returned no playable audio.");
    await saveVoiceSample(sample, refText);
    await markBuddyCloneVerified(result.provider);
    onStatus?.("Real custom voice generated, audio validated, and clone marked ready.");
    return result;
  }

  if (capability === "tts" && customVoiceSelected()) {
    const profile = getBuddyVoiceProfile();
    const sample = await getBuddyVoiceSample();
    const refText = (profile.referenceTranscript || "").trim();
    if (!sample || !refText) {
      throw new Error(
        "The verified custom voice reference is incomplete. Generate the clone again before using it.",
      );
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
