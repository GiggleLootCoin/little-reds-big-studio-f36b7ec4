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
    id: "cf-whisper-large-v3-turbo",
    name: "Cloudflare Whisper Large V3 Turbo",
    kind: "public",
    description: "Primary server-side speech-to-text engine for Buddy microphone input.",
    capabilities: ["speech-to-text", "transcription"],
    url: "/api/ai/speech-to-text",
    notes: "Server-side Workers AI Whisper route; accepts normalized PCM16 WAV audio.",
    priority: 1000,
  },
  {
    id: "buddy-web-search",
    name: "Buddy Live Web Search",
    kind: "public",
    description:
      "Server-side live internet search for current facts, research, models, tools, prices, and references.",
    capabilities: ["web-search", "research", "internet-search"],
    url: "/api/ai/web-search",
    notes:
      "No-key search route. Results are fetched server-side and returned with titles, URLs, and snippets.",
    priority: 1200,
  },
  {
    id: "cf-qwen3-chat",
    name: "Cloudflare Qwen3",
    kind: "public",
    description: "Server-side Buddy conversation engine.",
    capabilities: ["chat", "conversation", "text-generation", "text"],
    url: "/api/ai/chat",
    notes: "Primary server route; no client-side Gradio dependency.",
    priority: 1000,
  },
  {
    id: "cf-gpt-oss-chat",
    name: "Cloudflare GPT-OSS",
    kind: "public",
    description: "Open-weight conversational fallback.",
    capabilities: ["chat", "conversation", "text-generation", "text"],
    url: "/api/ai/chat",
    notes: "Server fallback.",
    priority: 990,
  },
  {
    id: "hf-qwen3-chat",
    name: "Qwen3 Free Chat",
    kind: "public",
    description: "Free public Qwen3 conversational fallback for Buddy.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo",
    notes: "Public Space fallback only after server routes fail; live validation required.",
    priority: 100,
  },
  {
    id: "hf-qwen3-omni-chat",
    name: "Qwen3 Omni Free Chat",
    kind: "public",
    description: "Free public multimodal conversational fallback for Buddy.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Omni-Demo",
    notes: "Public multimodal Space fallback; live validation required.",
    priority: 90,
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
    notes:
      "Uses full reference conditioning when a transcript is available and speaker-embedding mode otherwise.",
    priority: 1000,
  },
  {
    id: "hf-chatterbox-turbo",
    name: "Chatterbox Turbo",
    kind: "public",
    description:
      "Fast English zero-shot reference-voice cloning engine from Resemble AI, optimized for low-latency voice agents.",
    capabilities: ["voice-clone"],
    url: "https://huggingface.co/spaces/ResembleAI/chatterbox-turbo-demo",
    notes:
      "Preferred live Red route. Reference audio is explicitly passed to the generator; no demo/default speaker is permitted on the Red path.",
    priority: 950,
  },
  {
    id: "hf-chatterbox",
    name: "Chatterbox Voice Clone",
    kind: "public",
    description: "Free reference-voice cloning engine from Resemble AI.",
    capabilities: ["voice-clone", "tts"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox",
    notes:
      "Uses the supplied reference audio directly. Kept as an independent fallback after Qwen for non-default clone requests.",
    priority: 900,
  },
  {
    id: "hf-chatterbox-v3",
    name: "Chatterbox Multilingual",
    kind: "public",
    description: "Independent multilingual reference-voice cloning fallback.",
    capabilities: ["voice-clone"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-V3",
    notes: "Fallback for multilingual/non-default clone requests; never selected for the default Red live voice path.",
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
    name: "Seed-VC Singing Voice Conversion",
    kind: "public",
    description:
      "Zero-shot voice and singing-voice conversion with source-performance preservation.",
    capabilities: ["voice-swap", "singing-voice-conversion", "song-voice-swap"],
    url: "https://huggingface.co/spaces/Plachta/Seed-VC",
    notes:
      "Preferred free SVC route. The project explicitly supports zero-shot singing conversion; source vocals should be isolated for best results.",
    priority: 900,
  },
  {
    id: "hf-applio",
    name: "Applio RVC/SVC",
    kind: "public",
    description: "Open voice-conversion fallback for authorized speaking and singing voices.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion", "song-voice-swap"],
    url: "https://huggingface.co/spaces/IAHispano/ApplioX",
    notes:
      "Fallback conversion engine; not used to claim a custom clone without a verified reference.",
    priority: 500,
  },
  {
    id: "hf-minimax-music3-upsampler",
    name: "MiniMax Music 3 — Free ZeroGPU",
    kind: "gpu",
    description: "Free public ZeroGPU MiniMax Music 3 route with a dedicated plain-output API.",
    capabilities: ["music", "song", "lyrics-to-music", "audio-generation"],
    url: "https://huggingface.co/spaces/Upsampler/minimax-music3",
    notes: "Uses the Space's generate_music API, which returns a WAV file directly.",
    priority: 1100,
  },
  {
    id: "hf-minimax-music3-jam",
    name: "MiniMax Music 3 Jam — Free ZeroGPU",
    kind: "gpu",
    description: "Free public ZeroGPU MiniMax Music 3 fallback.",
    capabilities: ["music", "song", "lyrics-to-music", "audio-generation"],
    url: "https://huggingface.co/spaces/victor/MiniMax-Music3-Jam",
    notes: "Fallback only.",
    priority: 1000,
  },
];

export function runnersFor(capability: string) {
  return FREE_RUNNERS.filter((r) => r.capabilities.includes(capability)).sort(
    (a, b) => b.priority - a.priority,
  );
}
