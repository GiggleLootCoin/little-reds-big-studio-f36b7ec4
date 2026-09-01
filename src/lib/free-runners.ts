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

/** Free/no-key routes. Runtime validates live API and actual media artifacts. */
export const FREE_RUNNERS: FreeRunner[] = [
  {
    id: "cf-qwen3-chat",
    name: "Cloudflare Qwen3",
    kind: "public",
    description: "Server-side Buddy conversation engine.",
    capabilities: ["chat", "conversation", "text-generation", "text"],
    url: "/api/ai/chat",
    notes: "Server route.",
    priority: 300,
  },
  {
    id: "cf-gpt-oss-chat",
    name: "Cloudflare GPT-OSS",
    kind: "public",
    description: "Open-weight conversational fallback.",
    capabilities: ["chat", "conversation", "text-generation", "text"],
    url: "/api/ai/chat",
    notes: "Server fallback.",
    priority: 295,
  },
  {
    id: "cf-buddy-tts",
    name: "Buddy Voice Engine",
    kind: "public",
    description: "Fast server-side multilingual speech for everyday Buddy voices.",
    capabilities: ["tts"],
    url: "/api/ai/tts",
    notes: "Preset speech only; clone engines are excluded from this pool.",
    priority: 500,
  },
  {
    id: "hf-qwen3-tts",
    name: "Qwen3-TTS 1.7B Voice Clone",
    kind: "public",
    description: "Free reference-voice cloning fallback using Qwen3-TTS Base 1.7B.",
    capabilities: ["tts", "voice-clone"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-TTS",
    notes: "Uses full reference conditioning when a transcript is available and speaker-embedding mode otherwise.",
    priority: 1000,
  },
  {
    id: "hf-chatterbox",
    name: "Chatterbox Voice Clone",
    kind: "public",
    description: "Free reference-voice cloning engine from Resemble AI.",
    capabilities: ["voice-clone", "tts"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox",
    notes: "Uses the supplied reference audio directly. Kept as an independent fallback after Qwen.",
    priority: 900,
  },
  {
    id: "hf-chatterbox-v3",
    name: "Chatterbox Multilingual",
    kind: "public",
    description: "Independent multilingual reference-voice cloning fallback.",
    capabilities: ["voice-clone"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-V3",
    notes: "Fallback only; never treated as a preset voice.",
    priority: 800,
  },
  {
    id: "hf-cosyvoice3",
    name: "Velvet",
    kind: "public",
    description: "Multilingual zero-shot voice conversion fallback.",
    capabilities: ["voice-swap"],
    url: "https://huggingface.co/spaces/FunAudioLLM/Fun-CosyVoice3-0.5B",
    notes: "Voice conversion only; never selected as a custom-clone success path.",
    priority: 560,
  },
  {
    id: "hf-seed-vc",
    name: "Shift",
    kind: "public",
    description: "Voice-conversion fallback for authorized source voices.",
    capabilities: ["voice-swap"],
    url: "https://huggingface.co/spaces/Plachta/Seed-VC",
    notes: "Authorized voices only.",
    priority: 350,
  },
  {
    id: "hf-applio",
    name: "Forge",
    kind: "public",
    description: "Open voice-conversion fallback for authorized voices.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion"],
    url: "https://huggingface.co/spaces/IAHispano/ApplioX",
    notes: "Voice conversion only; not used to claim a custom clone.",
    priority: 300,
  },
  {
    id: "hf-qwen3-chat",
    name: "Qwen3",
    kind: "public",
    description: "Free conversational fallback.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo",
    notes: "Live validation required.",
    priority: 180,
  },
  {
    id: "hf-qwen3-omni-chat",
    name: "Qwen3 Omni",
    kind: "public",
    description: "Multimodal conversational fallback.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Omni-Demo",
    notes: "Live validation required.",
    priority: 170,
  },
  {
    id: "cf-flux-2-klein",
    name: "Cloudflare FLUX.2 Klein 4B",
    kind: "gpu",
    description: "Server-side text-to-image generation and editing.",
    capabilities: ["image", "image-generation", "artwork", "cover"],
    url: "/api/ai/image",
    notes: "Server route.",
    priority: 300,
  },
  {
    id: "cf-seedance-fast",
    name: "Cloudflare Seedance 2.0 Fast",
    kind: "gpu",
    description: "Text-to-video and image-to-video generation.",
    capabilities: ["video", "video-generation", "image-to-video", "animation"],
    url: "/api/ai/video",
    notes: "Server route.",
    priority: 300,
  },
  {
    id: "cf-music-26",
    name: "Cloudflare MiniMax Music 2.6",
    kind: "gpu",
    description: "Song and instrumental music generation.",
    capabilities: ["music", "song", "lyrics-to-music", "audio-generation"],
    url: "/api/ai/music",
    notes: "Server route.",
    priority: 300,
  },
  {
    id: "hf-demucs",
    name: "Demucs Stem Separation",
    kind: "gpu",
    description: "Real vocal/drum/bass/other separation.",
    capabilities: ["vocal-separation", "stems", "audio-separation"],
    url: "https://huggingface.co/spaces/owiedotch/demucs-stem-separation",
    notes: "Actual separated audio required.",
    priority: 170,
  },
];

export function runnersFor(capability: string): FreeRunner[] {
  return FREE_RUNNERS.filter((r) => r.capabilities.includes(capability)).sort(
    (a, b) => b.priority - a.priority,
  );
}
