/**
 * Playback-only preset previews.
 *
 * A preview is an existing audio asset. Previewing a preset never invokes
 * TTS, voice cloning, Aura, Qwen, or any Buddy backend generation route.
 *
 * Only voices with a real stored sample are exposed by the current picker.
 */
const STORED_PRESET_PREVIEWS: Record<string, string> = {
  Red: "/red_voice_mic_device10_30s_C.wav",
  Ryan: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/ryan_English.wav",
  Aiden: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/aiden_English.wav",
  Vivian: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/vivian_English.wav",
  Serena: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/serena_English.wav",
  Uncle_Fu: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/uncle_fu_English.wav",
  Dylan: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/dylan_English.wav",
  Eric: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/eric_English.wav",
  Ono_Anna: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/ono_anna_English.wav",
  Sohee: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/sohee_English.wav",
};

export function getStoredPresetPreview(speaker: string): string | null {
  const key = speaker.trim();
  return STORED_PRESET_PREVIEWS[key] || null;
}
