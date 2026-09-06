import { readFile } from "node:fs/promises";

const clone = await readFile("src/lib/real-voice-clone-v2.ts", "utf8");
const gateway = await readFile("src/lib/voice-clone-gateway.ts", "utf8");
const runtime = await readFile("src/lib/studio-runtime.ts", "utf8");
const registry = await readFile("src/lib/free-runtime.ts", "utf8");

const required = [
  ["browser clone safety boundary", clone, /normalizeAndVerifyBrowserAudio/],
  ["actual reference Blob reaches clone", clone, /sample:\s*Blob[\s\S]*blobBase64\(sample\)/],
  ["production clone endpoint", clone, /fetch\("\/api\/ai\/voice-clone"/],
  ["Qwen production handler", gateway, /export async function handleVoiceClone/],
  ["Qwen voice clone operation", gateway, /generate_voice_clone/],
  ["Qwen reference upload", gateway, /gradio_api\/upload/],
  ["verified Qwen3-TTS provider", gateway, /qwen-qwen3-tts\.hf\.space/],
  ["provider response marker", gateway, /x-clone-provider/],
  ["verified provider route marker", gateway, /x-red-voice-route.*qwen3-tts-reference-clone/],
  ["queue saturation is surfaced as temporary unavailability", gateway, /queueFull \? 503 : 502/],
  ["runtime production clone", runtime, /createBestFreeVoiceClone/],
  [
    "voice capability has no legacy fallback",
    registry,
    /voice-chatterbox-local[\s\S]*fallbackIds:\s*\[\]/,
  ],
];

for (const [label, source, pattern] of required) {
  if (!pattern.test(source)) throw new Error(`Voice-path verification failed: ${label}`);
}

for (const forbidden of [
  "createLocalChatterboxClone",
  "rahul7star",
  "spacekaren",
  "OPENROUTERAI_API_KEY",
  "QWEN_TTS_FALLBACK_SPACE_URL",
  "QWEN_TTS_SPACE_URL",
  "voxcpm2-reference-clone",
  "openbmb-voxcpm-demo.hf.space",
]) {
  if (clone.includes(forbidden) || runtime.includes(forbidden) || gateway.includes(forbidden))
    throw new Error(`Forbidden legacy production dependency: ${forbidden}`);
}

console.log(
  "Buddy production voice path verified: browser reference Blob -> /api/ai/voice-clone -> Qwen3-TTS reference clone -> validated browser audio.",
);
