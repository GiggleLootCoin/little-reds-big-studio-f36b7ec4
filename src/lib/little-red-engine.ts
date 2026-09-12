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
  return runStudioJob(capability, input, options.onStatus);
}
