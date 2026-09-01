// Compatibility shim: all production Qwen voice cloning now runs through the
// hardened gateway, including the free fallback route and reference-cache isolation.
export { handleVoiceClone as handleProductionQwenVoiceClone } from "./voice-clone-gateway";
