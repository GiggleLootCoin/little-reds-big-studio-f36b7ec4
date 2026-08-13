import type { FreeRunner } from "./free-runners";

export type StudioCapability = string;
export type StudioJobInput = Record<string, any>;
export type StudioArtifact = { capability: StudioCapability; value: any; url?: string; provider?: string };

// Existing runtime implementation remains the source of truth for provider routing.
// User-facing components must not surface provider diagnostics.
export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") for (const k of ["text","response","generated_text","transcription","transcript","content","value","data","output","result"]) {
    const t = artifactText((value as Record<string, unknown>)[k]);
    if (t) return t;
  }
  return "";
}

export async function runStudioJob(capability: StudioCapability, input: StudioJobInput, onStatus?: (s: string) => void): Promise<StudioArtifact> {
  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, input, onStatus);
}

export function runtimeProviders(capability?: StudioCapability): FreeRunner[] {
  return [];
}
