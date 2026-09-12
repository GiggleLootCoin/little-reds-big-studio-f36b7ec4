/**
 * Playback-only preset previews.
 *
 * A preview is an existing audio asset. Previewing a preset never invokes
 * TTS, voice cloning, Aura, Qwen, or any Buddy backend generation route.
 * The app proxies the fixed public samples through its own origin so Android
 * WebView/TWA playback does not depend on cross-origin media handling.
 */
const STORED_PRESET_PREVIEWS: Record<string, string> = {
  Red: "/red_voice_mic_device10_30s_C.wav",
  Ryan: "/api/preset-preview/Ryan",
  Aiden: "/api/preset-preview/Aiden",
  Vivian: "/api/preset-preview/Vivian",
  Serena: "/api/preset-preview/Serena",
  Uncle_Fu: "/api/preset-preview/Uncle_Fu",
  Dylan: "/api/preset-preview/Dylan",
  Eric: "/api/preset-preview/Eric",
  Ono_Anna: "/api/preset-preview/Ono_Anna",
  Sohee: "/api/preset-preview/Sohee",
};

export function getStoredPresetPreview(speaker: string): string | null {
  const key = speaker.trim();
  return STORED_PRESET_PREVIEWS[key] || null;
}
