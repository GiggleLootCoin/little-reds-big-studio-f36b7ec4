export type FreeRunner = {
  id: string;
  name: string;
  kind: "android" | "public" | "gpu";
  description: string;
  capabilities: string[];
  url: string;
  notes: string;
  priority: number;
};

export const FREE_RUNNERS: FreeRunner[] = [
  {
    id: "hf-qwen3-chat",
    name: "Qwen3",
    kind: "public",
    description: "Primary free Buddy cloud brain.",
    capabilities: ["chat", "conversation", "text-generation", "text"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo",
    notes: "Live schema required.",
    priority: 180,
  },
  {
    id: "hf-qwen3-omni",
    name: "Qwen3 Omni",
    kind: "public",
    description: "Multimodal Buddy fallback.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Omni-Demo",
    notes: "Live schema required.",
    priority: 170,
  },
  {
    id: "hf-qwen3-webgpu",
    name: "Qwen3 WebGPU",
    kind: "android",
    description: "Local Android writing fallback.",
    capabilities: ["text", "writing", "lyrics"],
    url: "https://huggingface.co/spaces/webml-community/qwen3-webgpu",
    notes: "Device capability dependent.",
    priority: 125,
  },
  {
    id: "hf-ace-step-15",
    name: "ACE-Step 1.5",
    kind: "public",
    description: "Full-song music generation.",
    capabilities: ["music", "song", "lyrics-to-music", "audio-to-audio"],
    url: "https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5",
    notes: "Live schema required.",
    priority: 160,
  },
  {
    id: "hf-diffrhythm2",
    name: "DiffRhythm 2",
    kind: "public",
    description: "Lyrics-conditioned full-song fallback.",
    capabilities: ["music", "song", "lyrics-to-music"],
    url: "https://huggingface.co/spaces/ASLP-lab/DiffRhythm2",
    notes: "Live schema required.",
    priority: 145,
  },
  {
    id: "hf-qwen3-tts",
    name: "Qwen3-TTS",
    kind: "public",
    description: "Primary natural conversational speech, voice design and cloning.",
    capabilities: ["voice", "voice-clone", "tts"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-TTS",
    notes:
      "Apache-2.0 Qwen3-TTS Space; live schema required. Never fall back to browser speech for Buddy Live.",
    priority: 190,
  },
  {
    id: "hf-chatterbox-v3",
    name: "Chatterbox Multilingual V3",
    kind: "public",
    description: "High-quality natural multilingual TTS and voice cloning fallback.",
    capabilities: ["voice", "voice-clone", "tts"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-V3",
    notes:
      "Current Chatterbox V3 route; MIT-licensed model family. Live schema required. Never fall back to browser speech for Buddy Live.",
    priority: 185,
  },
  {
    id: "hf-moss-tts",
    name: "MOSS-TTS",
    kind: "public",
    description: "Open voice-cloning fallback.",
    capabilities: ["voice", "voice-clone", "tts"],
    url: "https://huggingface.co/spaces/OpenMOSS-Team/MOSS-TTS-v1.5",
    notes: "Live schema required and quality-gated before delivery.",
    priority: 155,
  },
  {
    id: "hf-seed-vc",
    name: "Seed-VC",
    kind: "public",
    description: "Zero-shot speech and singing conversion.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion"],
    url: "https://huggingface.co/spaces/Plachta/Seed-VC",
    notes: "Use only authorized voices.",
    priority: 160,
  },
  {
    id: "hf-applio",
    name: "Applio / RVC",
    kind: "public",
    description: "RVC conversion fallback.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion", "voice-training"],
    url: "https://huggingface.co/spaces/IAHispano/ApplioX",
    notes: "Live schema required.",
    priority: 135,
  },
  {
    id: "hf-qwen3-asr",
    name: "Qwen3-ASR",
    kind: "public",
    description: "Primary speech recognition route.",
    capabilities: ["speech-to-text", "transcription", "realtime-asr"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-ASR",
    notes: "Live schema required.",
    priority: 170,
  },
  {
    id: "hf-whisper",
    name: "Whisper Large-v3-Turbo",
    kind: "public",
    description: "ASR fallback.",
    capabilities: ["speech-to-text", "transcription"],
    url: "https://huggingface.co/spaces/hf-audio/whisper-large-v3-turbo",
    notes: "Live schema required.",
    priority: 135,
  },
  {
    id: "hf-qwen-image",
    name: "Qwen Image",
    kind: "public",
    description: "Artwork and cover generation.",
    capabilities: ["image", "artwork", "cover"],
    url: "https://huggingface.co/spaces/Qwen/Qwen-Image",
    notes: "Live schema required.",
    priority: 175,
  },
  {
    id: "hf-qwen-image-edit",
    name: "Qwen Image Edit",
    kind: "public",
    description: "Natural-language image editing.",
    capabilities: ["image", "image-edit", "artwork"],
    url: "https://huggingface.co/spaces/Qwen/Qwen-Image-Edit",
    notes: "Live schema required.",
    priority: 170,
  },
  {
    id: "hf-z-image",
    name: "Z Image Turbo",
    kind: "public",
    description: "Fast image fallback.",
    capabilities: ["image", "artwork"],
    url: "https://huggingface.co/spaces/hf-applications/Z-Image-Turbo",
    notes: "Live schema required.",
    priority: 145,
  },
  {
    id: "hf-ltx-23",
    name: "LTX 2.3",
    kind: "public",
    description: "Open synchronized video generation.",
    capabilities: ["video", "image-to-video", "text-to-video", "audio-to-video", "music-video"],
    url: "https://huggingface.co/spaces/Lightricks/LTX-2-3",
    notes: "Live schema required.",
    priority: 170,
  },
  {
    id: "hf-wan-22",
    name: "Wan 2.2",
    kind: "public",
    description: "High-quality open video fallback.",
    capabilities: ["video", "image-to-video", "text-to-video", "music-video"],
    url: "https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster",
    notes: "Live schema required.",
    priority: 165,
  },
  {
    id: "hf-demucs",
    name: "Demucs",
    kind: "public",
    description: "Vocal and instrument separation.",
    capabilities: ["stems", "vocal-isolation", "vocal-separation"],
    url: "https://huggingface.co/spaces/nakas/demucs_playground",
    notes: "Live schema required.",
    priority: 125,
  },
];

export function runnersFor(capability?: string) {
  return [
    ...(capability
      ? FREE_RUNNERS.filter((r) => r.capabilities.includes(capability))
      : FREE_RUNNERS),
  ].sort((a, b) => b.priority - a.priority);
}

export function bestFreeRunner(capability: string) {
  return runnersFor(capability)[0] ?? null;
}
