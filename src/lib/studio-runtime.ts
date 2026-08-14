import type { FreeRunner } from "./free-runners";
import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";

export type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";

// The implementation owns provider routing and artifact normalization. This wrapper
// keeps the public runtime API stable while avoiding duplicate, incompatible types.
export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    for (const k of ["text", "response", "generated_text", "transcription", "transcript", "content", "value", "data", "output", "result"]) {
      const t = artifactText((value as Record<string, unknown>)[k]);
      if (t) return t;
    }
  }
  return "";
}

export async function runStudioJob(
  capability: StudioCapability,
  input: StudioJobInput,
  onStatus?: (s: string) => void,
): Promise<StudioArtifact> {
  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, input, onStatus);
}

export function runtimeProviders(capability?: StudioCapability): FreeRunner[] {
  // Keep this wrapper lightweight; the implementation owns provider selection.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return [];
}
