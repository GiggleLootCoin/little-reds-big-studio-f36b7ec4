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

/**
 * Free/no-key execution routes that can be driven from the Studio in a phone
 * browser. Heavy inference uses public browser Spaces; Colab and notebook
 * handoffs are deliberately excluded from the production pool.
 *
 * Registry entries are candidates, not promises. studio-runtime.ts must inspect
 * the live Gradio schema and validate a real returned artifact before success.
 */
export const FREE_RUNNERS: FreeRunner[] = [
  {
    id: "hf-qwen3-chat",
    name: "Qwen3",
    kind: "public",
    description: "Official Qwen3 conversational Space for Buddy's primary free cloud brain.",
    capabilities: ["chat", "conversation", "text-generation", "text"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo",
    notes:
      "Live Gradio API discovery is required; incompatible endpoints are rejected automatically.",
    priority: 180,
  },
  {
    id: "hf-qwen3-omni-chat",
    name: "Qwen3 Omni",
    kind: "public",
    description: "Official Qwen3 Omni multimodal assistant fallback for Buddy.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Omni-Demo",
    notes: "Use only when its live API exposes a compatible conversational route.",
    priority: 170,
  },
  {
    id: "hf-llama-32-chat",
    name: "Llama 3.2 3B Instruct",
    kind: "public",
    description: "Free public conversational fallback for Buddy.",
    capabilities: ["chat", "conversation", "text-generation", "text"],
    url: "https://huggingface.co/spaces/huggingface-projects/llama-3.2-3B-Instruct",
    notes: "Fallback only; live API discovery decides whether it is usable.",
    priority: 150,
  },
  {
    id: "hf-qwen3-webgpu",
    name: "Qwen3 WebGPU",
    kind: "android",
    description: "Browser-local Qwen3 writing fallback on capable Android devices.",
    capabilities: ["text", "writing", "lyrics"],
    url: "https://huggingface.co/spaces/webml-community/qwen3-webgpu",
    notes: "Optional device-local fallback. No Colab or computer is required.",
    priority: 125,
  },
  {
    id: "hf-ace-step-15",
    name: "ACE-Step 1.5",
    kind: "public",
    description: "Open full-song music generation with lyrics, vocals and backing.",
    capabilities: ["music", "song", "lyrics-to-music", "audio-to-audio"],
    url: "https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5",
    notes: "Primary free music route; live schema discovery is mandatory.",
    priority: 160,
  },
  {
    id: "hf-diffrhythm2",
    name: "DiffRhythm 2",
    kind: "public",
    description: "Lyrics-conditioned full-song generation fallback.",
    capabilities: ["music", "song", "lyrics-to-music", "style-conditioning"],
    url: "https://huggingface.co/spaces/ASLP-lab/DiffRhythm2",
    notes: "Fallback only; live API compatibility is checked before use.",
    priority: 145,
  },
  {
    id: "hf-ace-step",
    name: "ACE-Step",
    kind: "public",
    description: "Additional ACE-Step public music-generation fallback.",
    capabilities: ["music", "song", "lyrics-to-music"],
    url: "https://huggingface.co/spaces/ACE-Step/ACE-Step",
    notes: "Fallback only; the live API must remain compatible.",
    priority: 120,
  },
  {
    id: "hf-qwen3-tts",
    name: "Qwen3-TTS",
    kind: "public",
    description: "Natural speech, voice design and reference-voice cloning.",
    capabilities: ["voice", "voice-clone", "tts", "multilingual-tts"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-TTS",
    notes: "Live schema discovery is mandatory; only verified outputs count.",
    priority: 175,
  },
  {
    id: "hf-moss-tts-15",
    name: "MOSS-TTS v1.5",
    kind: "public",
    description: "Open multilingual TTS and zero-shot voice-cloning fallback.",
    capabilities: ["voice", "voice-clone", "tts", "multilingual-tts"],
    url: "https://huggingface.co/spaces/OpenMOSS-Team/MOSS-TTS-v1.5",
    notes: "Independent voice fallback; health and schema are checked live.",
    priority: 155,
  },
  {
    id: "hf-chatterbox-multilingual",
    name: "Chatterbox Multilingual",
    kind: "public",
    description: "Multilingual TTS and voice-cloning fallback.",
    capabilities: ["voice", "voice-clone", "tts", "multilingual-tts"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS",
    notes: "Independent fallback; live compatibility is required.",
    priority: 150,
  },
  {
    id: "hf-seed-vc",
    name: "Seed-VC",
    kind: "public",
    description: "Zero-shot speech and singing voice conversion.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion"],
    url: "https://huggingface.co/spaces/Plachta/Seed-VC",
    notes: "Use only voices the user owns or is authorized to transform.",
    priority: 160,
  },
  {
    id: "hf-applio",
    name: "Applio / RVC",
    kind: "public",
    description: "Open RVC voice-conversion and custom-model workflow.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion", "voice-training"],
    url: "https://huggingface.co/spaces/IAHispano/ApplioX",
    notes: "Advanced fallback; live API capability discovery is mandatory.",
    priority: 135,
  },
  {
    id: "hf-ai-rvc",
    name: "AI-RVC",
    kind: "public",
    description: "Whole-song cover workflow combining separation, conversion and remixing.",
    capabilities: [
      "voice-swap",
      "singing-voice-conversion",
      "ai-cover",
      "vocal-separation",
      "audio-mix",
    ],
    url: "https://huggingface.co/spaces/mason369/AI-RVC",
    notes: "Fallback only when its live API exposes the required inputs.",
    priority: 125,
  },
  {
    id: "hf-rvc-zero",
    name: "RVC Zero",
    kind: "public",
    description: "RVC voice-conversion framework on public ZeroGPU capacity.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion"],
    url: "https://huggingface.co/spaces/r3gm/RVC-ZERO",
    notes: "Fallback only; public RVC controls vary and are discovered live.",
    priority: 115,
  },
  {
    id: "hf-qwen3-asr",
    name: "Qwen3-ASR",
    kind: "public",
    description: "Official Qwen speech recognition for Buddy and transcription.",
    capabilities: ["speech-to-text", "transcription", "realtime-asr"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-ASR",
    notes: "Primary modern ASR candidate; input compatibility is verified live.",
    priority: 170,
  },
  {
    id: "hf-whisper-realtime",
    name: "Realtime Whisper Large-v3-Turbo",
    kind: "public",
    description: "Realtime speech-recognition fallback for Buddy conversation.",
    capabilities: ["speech-to-text", "realtime-asr", "conversation"],
    url: "https://huggingface.co/spaces/KingNish/Realtime-whisper-large-v3-turbo",
    notes: "Fallback when Qwen ASR is unavailable or incompatible.",
    priority: 145,
  },
  {
    id: "hf-whisper-large-v3-turbo",
    name: "Whisper Large-v3-Turbo",
    kind: "public",
    description: "High-quality recorded-audio transcription fallback.",
    capabilities: ["speech-to-text", "transcription"],
    url: "https://huggingface.co/spaces/hf-audio/whisper-large-v3-turbo",
    notes: "Live API is health-checked before selection.",
    priority: 135,
  },
  {
    id: "hf-whisper-fast-en",
    name: "Fast Whisper English",
    kind: "public",
    description: "Lightweight English transcription fallback.",
    capabilities: ["speech-to-text", "transcription", "realtime-asr"],
    url: "https://huggingface.co/spaces/abidlabs/fast-whisper-en-api",
    notes: "Fast English fallback; only verified outputs count.",
    priority: 120,
  },
  {
    id: "hf-qwen-image",
    name: "Qwen Image",
    kind: "public",
    description: "High-quality artwork and cover generation.",
    capabilities: ["image", "artwork", "cover"],
    url: "https://huggingface.co/spaces/Qwen/Qwen-Image",
    notes: "Live schema discovery is mandatory.",
    priority: 175,
  },
  {
    id: "hf-qwen-image-edit",
    name: "Qwen Image Edit",
    kind: "public",
    description: "Natural-language image editing and transformation.",
    capabilities: ["image", "image-edit", "artwork", "cover"],
    url: "https://huggingface.co/spaces/Qwen/Qwen-Image-Edit",
    notes: "Use when an input image is supplied; exact inputs are discovered live.",
    priority: 170,
  },
  {
    id: "hf-z-image",
    name: "Z Image Turbo",
    kind: "public",
    description: "Fast open text-to-image generation fallback.",
    capabilities: ["image", "artwork", "cover"],
    url: "https://huggingface.co/spaces/hf-applications/Z-Image-Turbo",
    notes: "Fallback after Qwen image routes.",
    priority: 145,
  },
  {
    id: "hf-sdxl",
    name: "SDXL Turbo",
    kind: "public",
    description: "Mature open image-generation fallback.",
    capabilities: ["image", "artwork", "cover", "image-edit"],
    url: "https://huggingface.co/spaces/diffusers/unofficial-SDXL-Turbo-i2i-t2i",
    notes: "Older but useful fallback when newer image routes are unavailable.",
    priority: 95,
  },
  {
    id: "hf-ltx-23",
    name: "LTX 2.3",
    kind: "public",
    description: "Open synchronized video generation.",
    capabilities: ["video", "image-to-video", "text-to-video", "audio-to-video", "music-video"],
    url: "https://huggingface.co/spaces/Lightricks/LTX-2-3",
    notes: "Primary free video route; live schema and artifact validation are mandatory.",
    priority: 170,
  },
  {
    id: "hf-wan-22-fast",
    name: "Wan 2.2 Fast",
    kind: "public",
    description: "High-quality open video fallback optimized for public inference.",
    capabilities: ["video", "image-to-video", "text-to-video", "animation", "music-video"],
    url: "https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster",
    notes: "Current public fast Space; live API discovery is mandatory.",
    priority: 165,
  },
  {
    id: "hf-ltx-video-fast",
    name: "LTX Video Fast",
    kind: "public",
    description: "Fast open video-generation fallback.",
    capabilities: ["video", "image-to-video", "text-to-video"],
    url: "https://huggingface.co/spaces/Lightricks/ltx-video-distilled",
    notes: "Fallback only when primary video routes are unavailable.",
    priority: 120,
  },
  {
    id: "hf-demucs",
    name: "Demucs Stem Separation",
    kind: "public",
    description: "Open vocal and instrument stem separation for the user's own songs.",
    capabilities: ["stems", "vocal-isolation", "vocal-separation"],
    url: "https://huggingface.co/spaces/nakas/demucs_playground",
    notes: "Useful component for cleanup and voice-conversion workflows.",
    priority: 125,
  },
  {
    id: "hf-kokoro",
    name: "Kokoro WebGPU",
    kind: "android",
    description: "Lightweight browser speech-synthesis fallback.",
    capabilities: ["tts", "voice"],
    url: "https://huggingface.co/spaces/webml-community/kokoro-webgpu",
    notes: "Fast local Android/browser fallback when remote voice routes are unavailable.",
    priority: 105,
  },
];

export function runnersFor(capability?: string) {
  const runners = capability
    ? FREE_RUNNERS.filter((runner) => runner.capabilities.includes(capability))
    : FREE_RUNNERS;
  return [...runners].sort((a, b) => b.priority - a.priority);
}

export function bestFreeRunner(capability: string) {
  return runnersFor(capability)[0] ?? null;
}
