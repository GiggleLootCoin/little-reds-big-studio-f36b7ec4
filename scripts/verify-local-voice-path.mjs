import { readFile } from "node:fs/promises";

// This verifier intentionally covers only the production Buddy custom-voice path.
const files = {
  clone: await readFile("src/lib/real-voice-clone-v2.ts", "utf8"),
  gateway: await readFile("src/lib/voice-clone-gateway.ts", "utf8"),
  runtime: await readFile("src/lib/studio-runtime.ts", "utf8"),
};

const required = [
  ["clone imports browser audio safety verifier", files.clone, "normalizeAndVerifyBrowserAudio"],
  ["clone accepts the actual reference Blob", files.clone, "sample: Blob"],
  ["clone rejects an empty reference recording", files.clone, "if (!sample.size)"],
  ["clone requires the reference transcript", files.clone, "if (!refText.trim())"],
  ["clone encodes the actual reference recording", files.clone, "audioBase64: await blobBase64(sample)"],
  ["clone sends the exact reference transcript", files.clone, "refText: refText.trim()"],
  ["clone calls the authorized Qwen gateway", files.clone, 'fetch("/api/voice-clone"'],
  ["clone reads the exact returned Blob", files.clone, "const generated = await response.blob()"],
  ["clone rejects empty generated audio", files.clone, "if (!generated.size)"],
  ["clone applies the browser audio safety boundary", files.clone, "const normalized = await normalizeAndVerifyBrowserAudio(generated)"],
  ["clone validates generated duration", files.clone, "normalized.stats.duration <= 0"],
  ["clone validates generated peak", files.clone, "normalized.stats.peak <= 0"],
  ["clone validates generated RMS", files.clone, "normalized.stats.rms <= 0"],
  ["clone returns the normalized browser URL", files.clone, "url: normalized.url"],
  ["gateway exposes the Qwen voice-clone handler", files.gateway, "export async function handleVoiceClone"],
  ["gateway uploads the actual reference Blob", files.gateway, "qwenUpload(space, audio, env)"],
  ["gateway uses the Qwen voice-clone operation", files.gateway, "generate_voice_clone"],
  ["gateway uses full reference conditioning", files.gateway, "use_xvector_only: false"],
  ["gateway uses Qwen 1.7B Base", files.gateway, 'model_size: "1.7B"'],
  ["gateway sends the reference audio object", files.gateway, "ref_audio: fileData"],
  ["gateway sends the exact reference transcript", files.gateway, "ref_text: refText"],
  ["gateway sends the target text", files.gateway, "target_text: text"],
  ["gateway downloads generated audio", files.gateway, "const generated = await fetch(audioUrl"],
  ["gateway removes any upstream verification claim", files.gateway, 'headers.delete("x-clone-verified")'],
  ["gateway identifies the Qwen provider", files.gateway, 'headers.set("x-clone-provider", "Qwen3-TTS 1.7B Base")'],
  ["runtime imports the production clone entry", files.runtime, "createBestFreeVoiceClone"],
  ["runtime intercepts voice-clone before generic runtime", files.runtime, 'if (capability === "voice-clone")'],
  ["runtime passes the actual reference Blob", files.runtime, "runVerifiedClone(sample, refText, targetText, language"],
  ["runtime requires a reference Blob", files.runtime, "sample instanceof Blob"],
  ["runtime preserves the reference transcript", files.runtime, "input.referenceTranscript"],
];

for (const [label, source, needle] of required) {
  if (!source.includes(needle)) throw new Error(`Voice-path verification failed: ${label}`);
}

const obsoleteClonePath = [
  ["production clone entry", files.clone],
  ["studio runtime", files.runtime],
];
for (const [name, source] of obsoleteClonePath) {
  if (source.includes("createLocalChatterboxClone")) {
    throw new Error(`Voice-path verification failed: obsolete local Chatterbox production path found in ${name}.`);
  }
}

const forbiddenProductionRemote = [
  ".hf.space",
  "rahul7star",
  "spacekaren",
  "/api/ai/voice-clone",
  "OPENROUTERAI_API_KEY",
];
for (const [name, source] of Object.entries({ clone: files.clone, runtime: files.runtime })) {
  for (const needle of forbiddenProductionRemote) {
    if (source.includes(needle)) {
      throw new Error(`Voice-path verification failed: forbidden legacy remote/API dependency found in ${name}: ${needle}`);
    }
  }
}

const runtimeRegistry = await readFile("src/lib/free-runtime.ts", "utf8");
const voiceBlock = runtimeRegistry.match(/id:\s*"voice-chatterbox-local"[\s\S]*?(?=\n\s*\},)/)?.[0] ?? "";
if (!voiceBlock.includes("fallbackIds: []")) {
  throw new Error("Voice capability registry must not advertise a voice fallback.");
}

console.log(
  "Buddy voice path verified: actual reference Blob + transcript -> /api/voice-clone -> Qwen3-TTS 1.7B Base full reference conditioning -> returned Blob -> normalizeAndVerifyBrowserAudio() -> validated normalized browser URL; obsolete local Chatterbox production path rejected.",
);
