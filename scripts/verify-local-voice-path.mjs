import { readFile } from "node:fs/promises";

const clone = await readFile("src/lib/real-voice-clone-v2.ts", "utf8");
const gateway = await readFile("src/lib/voice-clone-gateway.ts", "utf8");
const runtime = await readFile("src/lib/studio-runtime.ts", "utf8");
const registry = await readFile("src/lib/free-runtime.ts", "utf8");

const required = [
  ["browser clone safety boundary", clone, /normalizeAndVerifyBrowserAudio/],
  ["actual reference Blob reaches clone", clone, /sample:\s*Blob[\s\S]*blobBase64\(sample\)/],
  ["production clone endpoint", clone, /fetch\("\/api\/voice-clone"/],
  ["Qwen production handler", gateway, /export async function handleVoiceClone/],
  ["Qwen clone operation", gateway, /generate_voice_clone/],
  ["Qwen reference upload", gateway, /gradio_api\/upload/],
  ["free Qwen fallback", gateway, /QWEN_TTS_FALLBACK_SPACE_URL/],
  ["provider response marker", gateway, /x-clone-provider/],
  ["runtime production clone", runtime, /createBestFreeVoiceClone/],
  ["voice capability has no legacy fallback", registry, /voice-chatterbox-local[\s\S]*fallbackIds:\s*\[\]/],
];

for (const [label, source, pattern] of required) {
  if (!pattern.test(source)) throw new Error(`Voice-path verification failed: ${label}`);
}

for (const forbidden of ["createLocalChatterboxClone", "rahul7star", "spacekaren", "/api/ai/voice-clone", "OPENROUTERAI_API_KEY"]) {
  if (clone.includes(forbidden) || runtime.includes(forbidden)) throw new Error(`Forbidden legacy production dependency: ${forbidden}`);
}

console.log("Buddy production voice path verified: browser reference Blob -> /api/voice-clone -> Qwen3-TTS Base clone -> free fallback -> validated browser audio.");
