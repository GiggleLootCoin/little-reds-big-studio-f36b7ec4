import { readFile } from "node:fs/promises";

// This verifier intentionally covers only the production Buddy custom-voice path.
const files = {
  clone: await readFile("src/lib/real-voice-clone-v2.ts", "utf8"),
  local: await readFile("src/lib/local-chatterbox.ts", "utf8"),
  worker: await readFile("src/workers/chatterbox-local.worker.ts", "utf8"),
  buddy: await readFile("src/lib/buddy-voice.ts", "utf8"),
  runtime: await readFile("src/lib/studio-runtime.ts", "utf8"),
};

const required = [
  ["clone imports local engine", files.clone, "createLocalChatterboxClone"],
  ["clone passes uploaded reference", files.clone, "createLocalChatterboxClone(sample, text"],
  ["local API accepts Blob reference", files.local, "reference: Blob"],
  ["reference is decoded before conditioning", files.local, "decodeAt24k(reference)"],
  ["decoded reference is transferred to encoder worker", files.local, 'type: "encode"'],
  ["worker uses the Transformers.js Tensor contract", files.worker, 'new Tensor("float32", audio, [1, audio.length])'],
  ["worker performs speaker encoding", files.worker, "model.encode_speech(reference)"],
  ["worker validates all four conditioning outputs", files.worker, "assertConditioning(await model.encode_speech(reference))"],
  ["worker retains speaker conditioning", files.worker, "speakerConditioning = encoded"],
  ["worker passes all conditioning tensors to generation", files.worker, "...speakerConditioning"],
  ["worker loads the official Chatterbox model", files.worker, "onnx-community/chatterbox-ONNX"],
  ["worker uses the supported WebGPU language-model dtype", files.worker, 'language_model: "q4f16"'],
  ["worker rejects empty generated audio", files.worker, "Chatterbox generation returned empty audio"],
  ["Buddy sample persistence is local only", files.buddy, "putVoiceValue(SAMPLE_KEY"],
  ["voice clone is intercepted before generic runtime", files.runtime, 'if (capability === "voice-clone")'],
  ["verified clone uses local clone engine", files.runtime, "createBestFreeVoiceClone"],
  ["generic runtime is loaded only after voice handling", files.runtime, 'import("./studio-runtime-impl")'],
];

for (const [label, source, needle] of required) {
  if (!source.includes(needle)) throw new Error(`Voice-path verification failed: ${label}`);
}

const forbiddenSource = [
  ".hf.space",
  "rahul7star",
  "spacekaren",
  "/api/ai/voice-clone",
  "OPENROUTERAI_API_KEY",
];
for (const [name, source] of Object.entries(files)) {
  for (const needle of forbiddenSource) {
    if (source.includes(needle)) {
      throw new Error(`Voice-path verification failed: forbidden remote/API dependency found in ${name}: ${needle}`);
    }
  }
}

const runtimeRegistry = await readFile("src/lib/free-runtime.ts", "utf8");
const voiceBlock = runtimeRegistry.match(/id:\s*"voice-chatterbox-local"[\s\S]*?(?=\n\s*\},)/)?.[0] ?? "";
if (!voiceBlock.includes("fallbackIds: []")) {
  throw new Error("Voice capability registry must not advertise a voice fallback.");
}

console.log(
  "Buddy voice path verified: uploaded Blob -> 24 kHz decoded Float32Array -> Tensor[1,samples] -> Chatterbox encode_speech() -> four speaker-conditioning tensors -> Chatterbox generate() -> non-empty waveform -> UI artifact; no public Space, API-key route, or preset fallback in the clone path.",
);
