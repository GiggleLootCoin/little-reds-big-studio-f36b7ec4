/**
 * Free-only runtime capability registry.
 * Core Studio code must never require a paid provider or user-supplied API key.
 */
export type RuntimeKind = "local-webgpu" | "free-hosted" | "browser-native";

export type FreeCapability = {
  id: string;
  label: string;
  kind: RuntimeKind;
  requiresApiKey: false;
  capabilities: string[];
  fallbackIds: string[];
  notes?: string;
};

export const FREE_CAPABILITIES: FreeCapability[] = [
  {
    id: "buddy-local-webgpu",
    label: "Buddy — local WebGPU",
    kind: "local-webgpu",
    requiresApiKey: false,
    capabilities: ["chat", "context", "reasoning"],
    fallbackIds: ["buddy-free-hosted"],
    notes: "Uses a browser-capable open model when the Android device supports WebGPU.",
  },
  {
    id: "buddy-free-hosted",
    label: "Buddy — free/open hosted runtime",
    kind: "free-hosted",
    requiresApiKey: false,
    capabilities: ["chat", "context"],
    fallbackIds: ["buddy-local-webgpu"],
    notes: "Must only be marked available when a configured public free runtime responds.",
  },
  {
    id: "music-ace-step",
    label: "ACE-Step 1.5",
    kind: "free-hosted",
    requiresApiKey: false,
    capabilities: ["music", "lyrics-to-music", "audio-editing"],
    fallbackIds: ["music-open-fallback"],
    notes: "Primary open music-generation target; availability must be health-checked.",
  },
  {
    id: "music-open-fallback",
    label: "Open music fallback",
    kind: "free-hosted",
    requiresApiKey: false,
    capabilities: ["music"],
    fallbackIds: ["music-ace-step"],
    notes: "Only enabled when a current free/open public engine is verified reachable.",
  },
  {
    id: "voice-chatterbox-local",
    label: "Chatterbox — local reference voice",
    kind: "local-webgpu",
    requiresApiKey: false,
    capabilities: ["voice-clone", "tts"],
    fallbackIds: [],
    notes: "Uses the user's actual reference recording for conditioning on-device. No remote voice fallback is allowed.",
  },
  {
    id: "voice-rvc",
    label: "RVC / Applio",
    kind: "free-hosted",
    requiresApiKey: false,
    capabilities: ["voice-conversion", "vocal-swap"],
    fallbackIds: [],
    notes: "Only expose a route after a real authorized model/reference input produces a validated artifact.",
  },
  {
    id: "browser-audio",
    label: "Browser Audio",
    kind: "browser-native",
    requiresApiKey: false,
    capabilities: ["record", "trim", "split", "fade", "normalize", "preview", "export"],
    fallbackIds: [],
  },
];

export function getFreeCapabilities(capability: string) {
  return FREE_CAPABILITIES.filter((engine) => engine.capabilities.includes(capability));
}

export function hasRequiredPaidCredential(engine: FreeCapability) {
  return engine.requiresApiKey;
}
