import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { createRealVoiceClone, speakWithRealVoiceClone } from "./real-voice-clone";
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
    return localStorage.getItem("buddy-voice-choice") === "My voice";
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
    if (sample instanceof Blob) {
      onStatus?.("Creating a real custom voice from the reference recording…");
      const result = await createRealVoiceClone(
        sample,
        String(input.refText ?? input.referenceText ?? ""),
        String(input.target_text ?? input.text ?? input.prompt ?? ""),
        String(input.language ?? "English"),
      );
      onStatus?.("Real custom voice generated and verified.");
      return {
        capability: "voice-clone",
        value: result,
        url: result.url,
        provider: result.provider,
      };
    }
  }

  if (capability === "tts" && customVoiceSelected()) {
    const sample = await getVoiceSample();
    const refText = await getVoiceTranscript();
    if (sample && refText) {
      try {
        onStatus?.("Speaking with the verified custom voice…");
        const result = await speakWithRealVoiceClone(
          sample,
          refText,
          String(input.text ?? input.target_text ?? input.prompt ?? ""),
          String(input.language ?? "English"),
        );
        onStatus?.("Ready.");
        return {
          capability: "tts",
          value: result,
          url: result.url,
          provider: result.provider,
        };
      } catch (error) {
        console.warn("Verified custom voice failed; falling back to preset TTS", error);
        onStatus?.("Custom voice could not complete; using the selected preset voice.");
      }
    }
  }

  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, input, onStatus);
}
