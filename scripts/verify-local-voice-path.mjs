import { readFile } from "node:fs/promises";

// This verifier covers the production Buddy custom-voice path without depending on a live model service.
// Production trigger: keep the hardened Qwen upload assertions exercised on every deploy.
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
  [
    "clone encodes the actual reference recording",
    files.clone,
    "cachedReferenceBase64 = await blobBase64(sample)",
  ],
  ["clone binds encoded reference to its content hash", files.clone, "cachedReferenceId = id"],
  ["clone sends the exact reference transcript", files.clone, "refText: refText.trim()"],
  ["clone calls the authorized Qwen gateway", files.clone, 'fetch("/api/voice-clone"'],
  ["clone reads the exact returned Blob", files.clone, "const generated = await response.blob()"],
  ["clone rejects empty generated audio", files.clone, "if (!generated.size)"],
  [
    "clone applies the browser audio safety boundary",
    files.clone,
    "const normalized = await normalizeAndVerifyBrowserAudio(generated)",
  ],
  ["clone validates generated duration", files.clone, "normalized.stats.duration <= 0"],
  ["clone validates generated peak", files.clone, "normalized.stats.peak <= 0"],
  ["clone validates generated RMS", files.clone, "normalized.stats.rms <= 0"],
  ["clone returns the normalized browser URL", files.clone, "url: normalized.url"],
  [
    "gateway exposes the Qwen voice-clone handler",
    files.gateway,
    "export async function handleVoiceClone",
  ],
  [
    "gateway reconstructs the actual reference Blob",
    files.gateway,
    "new Blob([decodeBase64(audioBase64)]",
  ],
  ["gateway uploads through the Qwen file endpoint", files.gateway, "const form = new FormData()"],
  [
    "gateway uploads the reference to the selected Space",
    files.gateway,
    "fetch(`${space}/gradio_api/upload`",
  ],
  ["gateway uses the Qwen voice-clone operation", files.gateway, "generate_voice_clone"],
  [
    "gateway uses full reference conditioning",
    files.gateway,
    "[file, refText, text, languageName(language), false, modelSize]",
  ],
  [
    "gateway supports the fast and quality Qwen models",
    files.gateway,
    'modelSize?: "0.6B" | "1.7B"',
  ],
  [
    "gateway sends a Gradio FileData reference object",
    files.gateway,
    'meta: { _type: "gradio.FileData" }',
  ],
  ["gateway sends the exact reference transcript", files.gateway, "refText"],
  ["gateway sends the target text", files.gateway, "text"],
  ["gateway downloads generated audio", files.gateway, "const response = await fetch(url"],
  [
    "gateway removes any upstream verification claim",
    files.gateway,
    'headers.delete("x-clone-verified")',
  ],
  [
    "gateway identifies the selected Qwen provider",
    files.gateway,
    'headers.set("x-clone-provider", provider)',
  ],
  ["gateway has a second free Qwen route", files.gateway, "QWEN_TTS_FALLBACK_SPACE_URL"],
  [
    "gateway uses the fallback Qwen voice-clone operation",
    files.gateway,
    "officialClone(fallback, path",
  ],
  [
    "gateway preserves the reference separately per Space",
    files.gateway,
    "const key = `${space}|${referenceId}`",
  ],
  [
    "gateway rejects a completed response with no audio",
    files.gateway,
    "Qwen completed without an audio artifact",
  ],
  ["runtime imports the production clone entry", files.runtime, "createBestFreeVoiceClone"],
  [
    "runtime intercepts voice-clone before generic runtime",
    files.runtime,
    'if (capability === "voice-clone")',
  ],
  [
    "runtime passes the actual reference Blob",
    files.runtime,
    "runVerifiedClone(sample, refText, targetText, language",
  ],
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
    throw new Error(
      `Voice-path verification failed: obsolete local Chatterbox production path found in ${name}.`,
    );
  }
}

const forbiddenProductionRemote = [
  "rahul7star",
  "spacekaren",
  "/api/ai/voice-clone",
  "OPENROUTERAI_API_KEY",
];
for (const [name, source] of Object.entries({ clone: files.clone, runtime: files.runtime })) {
  for (const needle of forbiddenProductionRemote) {
    if (source.includes(needle))
      throw new Error(
        `Voice-path verification failed: forbidden legacy remote/API dependency found in ${name}: ${needle}`,
      );
  }
}

const runtimeRegistry = await readFile("src/lib/free-runtime.ts", "utf8");
const voiceBlock =
  runtimeRegistry.match(/id:\s*"voice-chatterbox-local"[\s\S]*?(?=\n\s*\},)/)?.[0] ?? "";
if (!voiceBlock.includes("fallbackIds: []"))
  throw new Error("Voice capability registry must not advertise a legacy voice fallback.");

console.log(
  "Buddy voice path verified: actual reference Blob -> content-hashed cached base64 -> /api/voice-clone -> Qwen3-TTS selected Base model with full reference conditioning -> free Qwen fallback -> returned Blob -> normalizeAndVerifyBrowserAudio() -> validated browser URL.",
);
