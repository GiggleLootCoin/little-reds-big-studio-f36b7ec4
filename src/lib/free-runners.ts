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
    id: "hf-whisper-large-v3",
    name: "Whisper Large V3 — Free ZeroGPU",
    kind: "gpu",
    description: "OpenAI Whisper Large V3 speech recognition through a fixed Hugging Face Space endpoint.",
    capabilities: ["speech-to-text", "transcription"],
    url: "https://huggingface.co/spaces/openai/whisper",
    notes: "Uses the Space's verified /transcribe endpoint. ZeroGPU availability is reported as a provider condition.",
    priority: 1000,
  },
  {
    id: "buddy-web-search",
    name: "Buddy Live Web Search",
    kind: "public",
    description:
      "Server-side live internet search for current facts, research, models, tools, prices, and references.",
    capabilities: ["web-search", "research", "internet-search"],
    url: "https://api.duckduckgo.com/",
    notes:
      "Free no-key DuckDuckGo Instant Answer route. It provides topic summaries/definitions/related topics, not a full ranked web index.",
    priority: 1200,
  },
  {
    id: "hf-qwen3-chat",
    name: "Qwen3 Free Chat",
    kind: "public",
    description: "Direct public Qwen3 conversational engine.",
    capabilities: ["chat", "conversation", "text-generation"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo",
    notes: "Online fallback; Studio verifies the returned text before accepting it.",
    priority: 1000,
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
    id: "hf-chatterbox",
    name: "Chatterbox Voice Clone",
    kind: "public",
    description: "Free reference-voice cloning engine from Resemble AI.",
    capabilities: ["voice-clone", "tts"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox",
    notes:
      "Uses the supplied reference audio directly. Kept as an independent fallback after Qwen.",
    priority: 900,
  },
  {
    id: "hf-chatterbox-v3",
    name: "Chatterbox Multilingual",
    kind: "public",
    description: "Independent multilingual reference-voice cloning fallback.",
    capabilities: ["voice-clone"],
    url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-V3",
    notes:
      "Fallback only; never treated as a preset voice. Default Red path skips this demo route.",
    priority: 700,
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
    priority: 1300,
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
    priority: 850,
  },
  {
    id: "hf-zimage-turbo",
    name: "Z-Image Turbo — Free ZeroGPU",
    kind: "gpu",
    description: "High-quality text-to-image generation on a free ZeroGPU Space.",
    capabilities: ["image", "image-generation", "artwork", "cover"],
    url: "https://huggingface.co/spaces/mrfakename/Z-Image-Turbo",
    notes: "Text-to-image route with prompt, dimensions, steps and seed inputs.",
    priority: 1150,
  },
  {
    id: "hf-qwen-image-fast",
    name: "Qwen Image Fast — Free ZeroGPU",
    kind: "gpu",
    description: "Free public ZeroGPU image generation/editing fallback.",
    capabilities: ["image", "image-generation", "artwork", "cover"],
    url: "https://huggingface.co/spaces/prithivMLmods/Qwen-Image-Edit-2511-LoRAs-Fast",
    notes: "Fallback image route; live schema and playable image are required.",
    priority: 1000,
  },
  {
    id: "hf-wan22-fast-preview",
    name: "Wan 2.2 Fast Preview — Free ZeroGPU",
    kind: "gpu",
    description: "Free public ZeroGPU image-to-video/text-to-video generation.",
    capabilities: ["video", "video-generation", "image-to-video", "animation"],
    url: "https://huggingface.co/spaces/kulkas2pintu/Wan2.2-14B-Fast-Preview",
    notes: "Preferred free video route; live schema and playable video are required.",
    priority: 1100,
  },
  {
    id: "hf-wan-s2v",
    name: "Wan 2.2 S2V — Free ZeroGPU (legacy alias)",
    kind: "gpu",
    description: "Compatibility alias for the Create panel's older Wan runner ID.",
    capabilities: ["video", "video-generation", "image-to-video", "animation"],
    url: "https://huggingface.co/spaces/kulkas2pintu/Wan2.2-14B-Fast-Preview",
    notes: "Legacy ID retained so older UI bundles resolve to the current Wan route.",
    priority: 1090,
  },
  {
    id: "hf-demucs",
    name: "Demucs Stem Separation",
    kind: "gpu",
    description: "Real vocal/drum/bass/other separation.",
    capabilities: ["vocal-separation", "stems", "audio-separation"],
    url: "https://huggingface.co/spaces/owiedotch/demucs-stem-separation",
    notes:
      "Actual separated audio required; intended as the first stage of song voice-swap workflows.",
    priority: 170,
  },
];

export function runnersFor(capability: string): FreeRunner[] {
  return FREE_RUNNERS.filter((r) => r.capabilities.includes(capability)).sort(
    (a, b) => b.priority - a.priority,
  );
}
