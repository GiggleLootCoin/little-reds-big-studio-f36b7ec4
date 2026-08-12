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

/** Free/no-key routes. Every route is a candidate; runtime validates its live API and artifact. */
export const FREE_RUNNERS: FreeRunner[] = [
  {
    id: "hf-qwen3-chat", name: "Qwen3", kind: "public", description: "Free conversational fallback for Buddy.",
    capabilities: ["chat", "conversation", "text-generation", "text"], url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo",
    notes: "Live Gradio API discovery and artifact validation required.", priority: 180,
  },
  {
    id: "hf-qwen3-omni-chat", name: "Qwen3 Omni", kind: "public", description: "Multimodal conversational fallback.",
    capabilities: ["chat", "conversation", "text-generation"], url: "https://huggingface.co/spaces/Qwen/Qwen3-Omni-Demo",
    notes: "Live API compatibility required.", priority: 170,
  },
  {
    id: "hf-llama-32-chat", name: "Llama 3.2 3B Instruct", kind: "public", description: "Free conversational fallback.",
    capabilities: ["chat", "conversation", "text-generation", "text"], url: "https://huggingface.co/spaces/huggingface-projects/llama-3.2-3B-Instruct",
    notes: "Live API compatibility required.", priority: 150,
  },
  {
    id: "hf-qwen3-webgpu", name: "Qwen3 WebGPU", kind: "android", description: "Browser-local writing fallback.",
    capabilities: ["text", "writing", "lyrics"], url: "https://huggingface.co/spaces/webml-community/qwen3-webgpu",
    notes: "Optional device-local route.", priority: 125,
  },
  {
    id: "hf-ace-step-15", name: "ACE-Step 1.5", kind: "public", description: "Full-song music generation.",
    capabilities: ["music", "song", "lyrics-to-music", "audio-to-audio"], url: "https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5",
    notes: "Live schema and real artifact required.", priority: 160,
  },
  {
    id: "hf-diffrhythm2", name: "DiffRhythm 2", kind: "public", description: "Lyrics-conditioned song generation fallback.",
    capabilities: ["music", "song", "lyrics-to-music", "style-conditioning"], url: "https://huggingface.co/spaces/ASLP-lab/DiffRhythm2",
    notes: "Live schema and real artifact required.", priority: 145,
  },
  {
    id: "hf-ace-step", name: "ACE-Step", kind: "public", description: "Additional song-generation fallback.",
    capabilities: ["music", "song", "lyrics-to-music"], url: "https://huggingface.co/spaces/ACE-Step/ACE-Step",
    notes: "Live API compatibility required.", priority: 120,
  },
  {
    id: "hf-moss-tts-15", name: "MOSS-TTS v1.5", kind: "public", description: "Open multilingual TTS and voice cloning.",
    capabilities: ["voice", "voice-clone", "tts", "multilingual-tts"], url: "https://huggingface.co/spaces/OpenMOSS-Team/MOSS-TTS-v1.5",
    notes: "Verified Space exists; runtime still validates live schema and audio output.", priority: 180,
  },
  {
    id: "hf-chatterbox-turbo", name: "Chatterbox Turbo", kind: "public", description: "Natural open-source TTS fallback.",
    capabilities: ["voice", "tts", "voice-clone"], url: "https://huggingface.co/spaces/ResembleAI/chatterbox-turbo-demo",
    notes: "Verified current Gradio Space; live artifact required.", priority: 170,
  },
  {
    id: "hf-chatterbox-multilingual", name: "Chatterbox Multilingual", kind: "public", description: "Multilingual TTS and voice-cloning fallback.",
    capabilities: ["voice", "voice-clone", "tts", "multilingual-tts"], url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS",
    notes: "Verified current Gradio Space; live artifact required.", priority: 160,
  },
  {
    id: "hf-seed-vc", name: "Seed-VC", kind: "public", description: "Zero-shot speech and singing voice conversion.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion"], url: "https://huggingface.co/spaces/Plachta/Seed-VC",
    notes: "Use only voices the user owns or is authorized to transform.", priority: 160,
  },
  {
    id: "hf-applio", name: "Applio / RVC", kind: "public", description: "Open RVC voice conversion.",
    capabilities: ["voice", "voice-swap", "singing-voice-conversion", "voice-training"], url: "https://huggingface.co/spaces/IAHispano/ApplioX",
    notes: "Live API compatibility required.", priority: 135,
  },
  {
    id: "hf-qwen3-asr", name: "Qwen3-ASR", kind: "public", description: "Speech recognition for Buddy.",
    capabilities: ["speech-to-text", "transcription", "realtime-asr"], url: "https://huggingface.co/spaces/Qwen/Qwen3-ASR",
    notes: "Live input compatibility required.", priority: 170,
  },
  {
    id: "hf-whisper-realtime", name: "Realtime Whisper", kind: "public", description: "Speech recognition fallback.",
    capabilities: ["speech-to-text", "transcription", "realtime-asr"], url: "https://huggingface.co/spaces/gradio/whisper-large-v3-turbo",
    notes: "Live input compatibility required.", priority: 155,
  },
];

export function runnersFor(capability: string): FreeRunner[] {
  return FREE_RUNNERS.filter((runner) => runner.capabilities.includes(capability)).sort((a, b) => b.priority - a.priority);
}
