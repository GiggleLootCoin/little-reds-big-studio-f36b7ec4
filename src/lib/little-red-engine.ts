import { runStudioJob, type StudioArtifact, type StudioCapability, type StudioJobInput } from "./studio-runtime";

/**
 * Stable capability boundary for Buddy and future local/community workers.
 * Provider/model selection remains behind the runtime implementation.
 */
export type LittleRedCapability = StudioCapability;
export type LittleRedJobInput = StudioJobInput;
export type LittleRedArtifact = StudioArtifact;

export interface LittleRedJobOptions {
  onStatus?: (status: string) => void;
  privacy?: "private" | "personal" | "community" | "public";
}

export async function runLittleRedJob(
  capability: LittleRedCapability,
  input: LittleRedJobInput,
  options: LittleRedJobOptions = {},
): Promise<LittleRedArtifact> {
  // Privacy is intentionally explicit at the engine boundary even while the
  // first implementation remains local/current-runtime backed. Future worker
  // routing must reject community execution for private jobs unless authorized.
  if (options.privacy === "community" && input._communityAuthorized !== true) {
    throw new Error("Community processing requires explicit user authorization.");
  }

  // A preset test may arrive through the older voice-clone capability call.
  // If it has an explicit speaker but no reference audio, it is a preset TTS
  // request, not a clone request. Never let the saved Red sample become the
  // accidental fallback for a selected preset.
  if (
    capability === "voice-clone" &&
    typeof input.speaker === "string" &&
    input.speaker.trim() &&
    !(input.audio instanceof Blob) &&
    !(input.refAudio instanceof Blob) &&
    !(input.referenceAudio instanceof Blob)
  ) {
    return runStudioJob("tts", input, options.onStatus);
  }

  return runStudioJob(capability, input, options.onStatus);
}
