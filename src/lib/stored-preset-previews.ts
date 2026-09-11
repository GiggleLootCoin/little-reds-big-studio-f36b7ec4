/**
 * Playback-only preset previews.
 *
 * These URLs point at stored audio assets. Previewing a preset must never invoke
 * TTS, voice cloning, Aura, Qwen, or any Buddy backend generation route.
 */
const STORED_PRESET_PREVIEWS: Record<string, string> = {
  Red: "/red_voice_mic_device10_30s_C.wav",
  Ryan:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/ryan_English.wav",
  Aiden:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/aiden_English.wav",
  Vivian:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/vivian_English.wav",
  Serena:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/serena_English.wav",
  Uncle_Fu:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/uncle_fu_English.wav",
  Dylan:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/dylan_English.wav",
  Eric:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/eric_English.wav",
  Ono_Anna:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/ono_anna_English.wav",
  Sohee:
    "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/sohee_English.wav",
};

const NORMALIZED_PRESET_ALIASES: Record<string, keyof typeof STORED_PRESET_PREVIEWS> = {
  "aura-2-luna-en": "Ryan",
  "aura-2-orpheus-en": "Aiden",
  "aura-2-athena-en": "Vivian",
  "aura-2-asteria-en": "Serena",
  "aura-2-atlas-en": "Uncle_Fu",
  "aura-2-juno-en": "Dylan",
  "aura-2-zeus-en": "Eric",
  "aura-2-phoebe-en": "Ono_Anna",
  "aura-2-delia-en": "Sohee",
};

export function getStoredPresetPreview(speaker: string): string | null {
  const key = speaker.trim();
  const direct = STORED_PRESET_PREVIEWS[key];
  if (direct) return direct;
  const alias = NORMALIZED_PRESET_ALIASES[key];
  return alias ? STORED_PRESET_PREVIEWS[alias] : null;
}
