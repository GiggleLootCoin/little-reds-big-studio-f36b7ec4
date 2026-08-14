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
    description: "Server-side Buddy text generation without exposing an API key.",
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
    name: "Buddy Local TTS",
    kind: "public",
    description: "Server-side multilingual Buddy speech with automatic model fallback.",
    capabilities: ["tts"],
    url: "/api/ai/tts",
    notes: "Preset-only route; browser speech remains the final device fallback.",
    priority: 500,
  },
  {
    id: "hf-chatterbox-v3",
    name: "Chatterbox Multilingual V3",
    kind: "public",
    description: "Primary free reference-audio cloning route with multilingual speaker similarity.",
    capabilities: ["voice-clone"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-V3",
    notes:
      "Primary clone route. Requires a live compatible Gradio endpoint and authorized reference audio.",
    priority: 650,
  },
  {
    id: "hf-chatterbox",
    name: "Chatterbox",
    kind: "public",
    description: "English zero-shot reference-voice cloning fallback.",
    capabilities: ["voice-clone"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox",
    notes:
      "Secondary clone route. Uses reference audio only when the user has permission to clone it.",
    priority: 600,
  },
  {
    id: "hf-cosyvoice3",
    name: "CosyVoice 3",
    kind: "public",
    description: "Multilingual zero-shot cloning fallback with expressive controls.",
    capabilities: ["voice-clone", "voice-swap"],
    url: "https://huggingface.co/spaces/FunAudioLLM/Fun-CosyVoice3-0.5B",
    notes: "Secondary multilingual clone route; live endpoint validation required.",
    priority: 560,
  },
  {
    id: "hf-seed-vc",
    name: "Seed-VC",
    kind: "public",
    description: "Voice conversion fallback.",
    capabilities: ["voice-swap", "voice-clone"],
    url: "https://huggingface.co/spaces/Plachta/Seed-VC",
    notes: "Only transform voices the user owns or is authorized to use.",
    priority: 350,
  },
  {
    id: "hf-applio",
    name: "Applio / RVC",
    kind: "public",
    description: "Open voice conversion fallback.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion", "voice-clone"],
    url: "https://huggingface.co/spaces/IAHispano/ApplioX",
    notes: "Live API compatibility required; authorized voices only.",
    priority: 300,
  },
  {
    id: "hf-moss-tts",
    name: "MOSS-TTS",
    kind: "public",
    description: "Multilingual voice cloning fallback.",
    capabilities: ["tts", "voice-clone"],
    url: "https://huggingface.co/spaces/fnlp/MOSS-TTS",
    notes: "Use only when the live Space exposes a compatible clone endpoint.",
    priority: 280,
  },
  {
    id: "hf-qwen3-tts",
    name: "Qwen3-TTS",
    kind: "public",
    description: "Last-resort Qwen custom voice and clone route.",
    capabilities: ["tts", "voice-clone"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-TTS",
    notes: "Last resort only; its public ZeroGPU capacity may be exhausted.",
    priority: 120,
  },
  {
    id: "hf-qwen3-chat",
    name: "Qwen3",
    kind: "public",
    description: "Free conversational fallback.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo",
    notes: "Live Gradio validation required.",
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
