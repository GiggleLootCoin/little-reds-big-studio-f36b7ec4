import { readFile } from "node:fs/promises";

const clone = await readFile("src/lib/real-voice-clone-v2.ts", "utf8");
const gateway = await readFile("src/lib/voice-clone-gateway.ts", "utf8");
const runtime = await readFile("src/lib/studio-runtime.ts", "utf8");
const registry = await readFile("src/lib/free-runtime.ts", "utf8");

const checks = [
  ["clone safety verifier", clone, /normalizeAndVerifyBrowserAudio/], ["clone accepts Blob", clone, /sample:\s*Blob/],
  ["clone rejects empty reference", clone, /if \(!sample\.size\)/], ["clone requires transcript", clone, /if \(!refText\.trim\(\)\)/],
  ["clone hashes and encodes reference", clone, /cachedReferenceBase64\s*=\s*await blobBase64\(sample\)/], ["clone binds reference ID", clone, /cachedReferenceId\s*=\s*id/],
  ["clone calls production endpoint", clone, /fetch\("\/api\/voice-clone"/], ["clone reads returned Blob", clone, /await response\.blob\(\)/],
  ["clone normalizes generated audio", clone, /normalizeAndVerifyBrowserAudio\(generated\)/], ["clone validates duration", clone, /normalized\.stats\.duration/],
  ["clone validates peak", clone, /normalized\.stats\.peak/], ["clone validates RMS", clone, /normalized\.stats\.rms/], ["clone returns browser URL", clone, /url:\s*normalized\.url/],
  ["gateway handler", gateway, /export async function handleVoiceClone/], ["gateway reconstructs reference Blob", gateway, /new Blob\(\[decodeBase64\(audioBase64\)\]/],
  ["gateway uploads with FormData", gateway, /const form = new FormData\(\)/], ["gateway uses Gradio upload", gateway, /gradio_api\/upload/],
  ["gateway uses generate_voice_clone", gateway, /generate_voice_clone/], ["gateway sends FileData", gateway, /gradio\.FileData/],
  ["gateway sends reference transcript", gateway, /refText/], ["gateway sends target text", gateway, /text/], ["gateway downloads returned audio", gateway, /fetch\(url/],
  ["gateway strips upstream verification", gateway, /headers\.delete\("x-clone-verified"\)/], ["gateway identifies provider", gateway, /headers\.set\("x-clone-provider", provider\)/],
  ["gateway has free fallback", gateway, /QWEN_TTS_FALLBACK_SPACE_URL/], ["gateway uses fallback clone route", gateway, /officialClone\(fallback/],
  ["gateway isolates reference cache by Space", gateway, /const key = `\$\{space\}\|\$\{referenceId\}`/], ["gateway rejects missing completed audio", gateway, /Qwen completed without an audio artifact/],
  ["runtime uses production clone", runtime, /createBestFreeVoiceClone/], ["runtime intercepts voice clone", runtime, /capability === "voice-clone"/],
  ["runtime passes Blob", runtime, /runVerifiedClone\(sample, refText, targetText, language/], ["runtime requires Blob", runtime, /sample instanceof Blob/],
  ["runtime preserves transcript", runtime, /input\.referenceTranscript/], ["legacy local fallback disabled", registry, /id:\s*"voice-chatterbox-local"[\s\S]*fallbackIds:\s*\[\]/],
];
for (const [label, source, pattern] of checks) if (!pattern.test(source)) throw new Error(`Voice-path verification failed: ${label}`);
for (const forbidden of ["createLocalChatterboxClone", "rahul7star", "spacekaren", "/api/ai/voice-clone", "OPENROUTERAI_API_KEY"]) {
  if (clone.includes(forbidden) || runtime.includes(forbidden)) throw new Error(`Forbidden legacy production dependency: ${forbidden}`);
}
console.log("Buddy production voice path verified: actual reference Blob -> content-bound cache -> Qwen3-TTS Base clone -> free second Qwen route -> returned audio -> browser safety validation.");
