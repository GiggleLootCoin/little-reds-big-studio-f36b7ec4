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
  { id: "cf-qwen3-chat", name: "Cloudflare Qwen3", kind: "public", description: "Server-side Buddy text generation without exposing an API key.", capabilities: ["chat", "conversation", "text-generation", "text"], url: "/api/ai/chat", notes: "Uses the repository's Cloudflare Workers AI binding.", priority: 300 },
  { id: "cf-gpt-oss-chat", name: "Cloudflare GPT-OSS", kind: "public", description: "Current open-weight conversational fallback.", capabilities: ["chat", "conversation", "text-generation", "text"], url: "/api/ai/chat", notes: "Server-side fallback; no client key.", priority: 295 },
  { id: "hf-qwen3-chat", name: "Qwen3", kind: "public", description: "Free conversational fallback for Buddy.", capabilities: ["chat", "conversation", "text-generation", "text"], url: "https://huggingface.co/spaces/Qwen/Qwen3-Demo", notes: "Live Gradio API discovery and artifact validation required.", priority: 180 },
  { id: "hf-qwen3-omni-chat", name: "Qwen3 Omni", kind: "public", description: "Multimodal conversational fallback.", capabilities: ["chat", "conversation", "text-generation"], url: "https://huggingface.co/spaces/Qwen/Qwen3-Omni-Demo", notes: "Live API compatibility required.", priority: 170 },
  { id: "cf-flux-2-klein", name: "Cloudflare FLUX.2 Klein 4B", kind: "gpu", description: "Real server-side text-to-image generation and editing.", capabilities: ["image", "image-generation", "artwork", "cover"], url: "/api/ai/image", notes: "Uses the current FLUX.2 Klein 4B multipart binding.", priority: 300 },
  { id: "cf-seedance-fast", name: "Cloudflare Seedance 2.0 Fast", kind: "gpu", description: "Real text-to-video and image-to-video generation with optional audio.", capabilities: ["video", "video-generation", "image-to-video", "animation"], url: "/api/ai/video", notes: "Uses the current unified Cloudflare AI catalog route.", priority: 300 },
  { id: "cf-music-26", name: "Cloudflare MiniMax Music 2.6", kind: "gpu", description: "Real full-song and instrumental music generation.", capabilities: ["music", "song", "lyrics-to-music", "audio-generation"], url: "/api/ai/music", notes: "Uses the current unified Cloudflare AI music route; returns a real audio URL.", priority: 300 },
  { id: "hf-qwen3-webgpu", name: "Qwen3 WebGPU", kind: "android", description: "Browser-local writing fallback.", capabilities: ["text", "writing", "lyrics"], url: "https://huggingface.co/spaces/webml-community/qwen3-webgpu", notes: "Optional device-local route.", priority: 125 },
  { id: "hf-ace-step-15", name: "ACE-Step 1.5", kind: "public", description: "Full-song music generation fallback.", capabilities: ["music", "song", "lyrics-to-music", "audio-to-audio"], url: "https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5", notes: "Fallback only; live schema and real artifact required.", priority: 160 },
  { id: "hf-diffrhythm2", name: "DiffRhythm 2", kind: "public", description: "Lyrics-conditioned song generation fallback.", capabilities: ["music", "song", "lyrics-to-music", "style-conditioning"], url: "https://huggingface.co/spaces/ASLP-lab/DiffRhythm2", notes: "Fallback only; live schema and real audio artifact required.", priority: 150 },
  { id: "cf-melotts", name: "Cloudflare MeloTTS", kind: "gpu", description: "Primary server-side Buddy speech generation.", capabilities: ["voice", "tts", "multilingual-tts"], url: "/api/ai/tts", notes: "Cheap first choice; server automatically fails over to Aura-2 then Aura-1.", priority: 300 },
  { id: "cf-aura-2", name: "Cloudflare Aura-2", kind: "gpu", description: "Natural TTS failover when MeloTTS is unavailable.", capabilities: ["voice", "tts"], url: "/api/ai/tts", notes: "Server-side Deepgram Aura-2 fallback.", priority: 295 },
  { id: "cf-whisper", name: "Cloudflare Whisper", kind: "gpu", description: "Reliable server-side speech recognition for Android voice chat.", capabilities: ["speech-to-text", "transcription", "realtime-asr"], url: "/api/ai/speech-to-text", notes: "Audio is sent to the server and transcribed with current Whisper.", priority: 300 },
  { id: "hf-moss-tts-15", name: "MOSS-TTS v1.5", kind: "public", description: "Open multilingual TTS and voice cloning fallback.", capabilities: ["voice", "voice-clone", "tts", "multilingual-tts"], url: "https://huggingface.co/spaces/OpenMOSS-Team/MOSS-TTS-v1.5", notes: "Fallback only; live schema and audio artifact required.", priority: 180 },
  { id: "hf-chatterbox-turbo", name: "Chatterbox Turbo", kind: "public", description: "Natural open-source TTS fallback.", capabilities: ["voice", "tts", "voice-clone"], url: "https://huggingface.co/spaces/ResembleAI/chatterbox-turbo-demo", notes: "Fallback only; live schema and audio artifact required.", priority: 170 },
  { id: "hf-chatterbox-multilingual", name: "Chatterbox Multilingual", kind: "public", description: "Multilingual TTS and voice-cloning fallback.", capabilities: ["voice", "voice-clone", "tts", "multilingual-tts"], url: "https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS", notes: "Fallback only; live schema and audio artifact required.", priority: 160 },
  { id: "hf-seed-vc", name: "Seed-VC", kind: "public", description: "Zero-shot speech and singing voice conversion.", capabilities: ["voice", "voice-swap", "singing-voice-conversion"], url: "https://huggingface.co/spaces/Plachta/Seed-VC", notes: "Use only voices the user owns or is authorized to transform.", priority: 160 },
  { id: "hf-applio", name: "Applio / RVC", kind: "public", description: "Open RVC voice conversion.", capabilities: ["voice", "voice-swap", "singing-voice-conversion", "voice-training"], url: "https://huggingface.co/spaces/IAHispano/ApplioX", notes: "Live API compatibility required.", priority: 135 },
  { id: "hf-ltx-video", name: "LTX Video Fast", kind: "gpu", description: "Video generation fallback.", capabilities: ["video", "video-generation", "image-to-video"], url: "https://huggingface.co/spaces/Lightricks/ltx-video-distilled", notes: "Fallback only; live schema and actual video artifact required.", priority: 200 },
  { id: "hf-wan22-fast", name: "Wan2.2 14B Fast", kind: "gpu", description: "Image-to-video fallback.", capabilities: ["video", "video-generation", "image-to-video", "animation"], url: "https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster", notes: "Fallback only; requires compatible image input.", priority: 190 },
  { id: "hf-demucs", name: "Demucs Stem Separation", kind: "gpu", description: "Real vocal/drum/bass/other stem separation.", capabilities: ["vocal-separation", "stems", "audio-separation"], url: "https://huggingface.co/spaces/owiedotch/demucs-stem-separation", notes: "Live Space; output must contain actual separated audio artifacts.", priority: 170 },
];

export function runnersFor(capability: string): FreeRunner[] {
  return FREE_RUNNERS.filter((runner) => runner.capabilities.includes(capability)).sort((a, b) => b.priority - a.priority);
}
