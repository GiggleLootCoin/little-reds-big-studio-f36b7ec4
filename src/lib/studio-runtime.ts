import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { createRealVoiceClone, speakWithRealVoiceClone } from "./real-voice-clone";

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

function savedCloneId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("lrbgs-buddy-clone-voice-id");
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

function saveCloneId(id: string | undefined) {
  if (!id || typeof window === "undefined") return;
  try {
    localStorage.setItem("lrbgs-buddy-clone-voice-id", id);
  } catch {
    /* best effort */
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
      try {
        onStatus?.("Creating a real custom voice from the reference recording…");
        const result = await createRealVoiceClone(
          sample,
          String(input.target_text ?? input.text ?? input.prompt ?? "This is a real test of my custom voice."),
          String(input.language ?? "English"),
        );
        saveCloneId(result.voiceId);
        onStatus?.("Real custom voice created and previewed.");
        return {
          capability: "voice-clone",
          value: result,
          url: result.url,
          provider: result.provider,
        };
      } catch (error) {
        console.warn("Primary custom voice clone failed; trying the existing provider pool", error);
        onStatus?.("Primary custom voice service unavailable; trying the backup clone engines…");
      }
    }
  }

  if (capability === "tts") {
    const voiceId = savedCloneId();
    if (voiceId) {
      try {
        onStatus?.("Speaking with the verified custom voice…");
        const result = await speakWithRealVoiceClone(
          voiceId,
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
        onStatus?.("Custom voice unavailable; using the selected preset voice.");
      }
    }
  }

  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, input, onStatus);
}
