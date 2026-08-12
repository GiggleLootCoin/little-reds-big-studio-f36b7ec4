export type FreeRunner = {
  id: string;
  name: string;
  kind: "android" | "public";
  description: string;
  capabilities: string[];
  url: string;
  notes: string;
  priority: number;
};

/** Free/no-key routes. We store integration metadata, never model weights. */
export const FREE_RUNNERS: FreeRunner[] = [
  {
    id: "bonsai-webgpu",
    name: "Bonsai WebGPU",
    kind: "android",
    description: "Local browser reasoning and writing on capable WebGPU devices.",
    capabilities: ["text", "writing", "lyrics"],
    url: "https://huggingface.co/spaces/webml-community/bonsai-webgpu-kernels",
    notes: "Local browser inference; phone performance varies.",
    priority: 100,
  },
  {
    id: "hf-rvc",
    name: "Applio / RVC",
    kind: "public",
    description: "High-quality RVC voice conversion.",
    capabilities: ["voice", "voice-swap"],
    url: "https://huggingface.co/spaces/IAHispano/ApplioX",
    notes: "Public Space; shared capacity can be busy.",
    priority: 100,
  },
  {
    id: "hf-kokoro",
    name: "Kokoro TTS WebGPU",
    kind: "android",
    description: "Lightweight browser speech synthesis.",
    capabilities: ["voice", "text"],
    url: "https://huggingface.co/spaces/webml-community/kokoro-webgpu",
    notes: "Lightweight Android/browser route.",
    priority: 90,
  },
  {
    id: "hf-qwen3-tts",
    name: "Qwen3-TTS",
    kind: "public",
    description: "Speech generation, voice design and cloning demo.",
    capabilities: ["voice", "text", "voice-clone"],
    url: "https://huggingface.co/spaces/Qwen/Qwen3-TTS",
    notes: "Official Qwen public Space; quality voice fallback.",
    priority: 95,
  },
  {
    id: "hf-ace-step",
    name: "ACE-Step 1.5",
    kind: "public",
    description: "Open music generation and editing.",
    capabilities: ["music"],
    url: "https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5",
    notes: "Official public Space; shared capacity can be busy.",
    priority: 100,
  },
  {
    id: "hf-musicgen",
    name: "MusicGen Web",
    kind: "android",
    description: "Smaller browser-based music generation.",
    capabilities: ["music", "small-audio"],
    url: "https://huggingface.co/spaces/Xenova/musicgen-web",
    notes: "Useful lightweight local route.",
    priority: 80,
  },
  {
    id: "hf-demucs",
    name: "Demucs",
    kind: "public",
    description: "Open vocal/instrument stem separation.",
    capabilities: ["stems"],
    url: "https://huggingface.co/spaces/nakas/demucs_playground",
    notes: "Long tracks may queue on shared compute.",
    priority: 90,
  },
  {
    id: "hf-bs-roformer",
    name: "BS-Roformer",
    kind: "public",
    description: "Modern open audio separation fallback.",
    capabilities: ["stems"],
    url: "https://huggingface.co/spaces/huggingapps/BS-Roformer-Leap-Audio-Separator",
    notes: "Fallback when Demucs is unavailable.",
    priority: 80,
  },
  {
    id: "hf-qwen-image",
    name: "Qwen Image",
    kind: "public",
    description: "High-quality image generation and editing with strong typography.",
    capabilities: ["image", "image-edit", "artwork"],
    url: "https://huggingface.co/spaces/Qwen/Qwen-Image",
    notes: "Official Qwen ZeroGPU Space.",
    priority: 110,
  },
  {
    id: "hf-z-image",
    name: "Z Image Turbo",
    kind: "public",
    description: "Fast open text-to-image generation.",
    capabilities: ["image", "artwork"],
    url: "https://huggingface.co/spaces/mrfakename/Z-Image-Turbo",
    notes: "Fast image fallback.",
    priority: 100,
  },
  {
    id: "hf-sdxl",
    name: "SDXL Turbo",
    kind: "public",
    description: "Fast open image-generation/editing fallback.",
    capabilities: ["image", "artwork"],
    url: "https://huggingface.co/spaces/diffusers/unofficial-SDXL-Turbo-i2i-t2i",
    notes: "Fallback image route.",
    priority: 80,
  },
  {
    id: "hf-wan-s2v",
    name: "Wan 2.2 S2V",
    kind: "public",
    description: "Image + audio conditioned video generation.",
    capabilities: ["video", "image-to-video", "audio-to-video"],
    url: "https://huggingface.co/spaces/Wan-AI/Wan2.2-S2V",
    notes: "Official Wan Space; heavy jobs can queue.",
    priority: 110,
  },
  {
    id: "hf-ltx-23",
    name: "LTX 2.3",
    kind: "public",
    description: "Open synchronized audio-video generation.",
    capabilities: ["video", "image-to-video", "audio-to-video"],
    url: "https://huggingface.co/spaces/Lightricks/LTX-2-3",
    notes: "Official Lightricks ZeroGPU Space; strong music-video route.",
    priority: 105,
  },
  {
    id: "hf-wan-video",
    name: "Wan 2.2 Video",
    kind: "public",
    description: "Fast open image-to-video generation.",
    capabilities: ["video", "image-to-video"],
    url: "https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster",
    notes: "Fast public ZeroGPU fallback.",
    priority: 90,
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
