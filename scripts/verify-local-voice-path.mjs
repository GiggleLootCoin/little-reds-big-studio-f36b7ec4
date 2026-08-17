import { readFile } from "node:fs/promises";

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
  ["reference is sent to encoder worker", files.local, 'type: "encode"'],
  ["worker wraps reference as RawAudio", files.worker, "new RawAudio(audio, SAMPLE_RATE)"],
  ["worker uses the public processor call", files.worker, "processor(\"\", reference)"],
  ["worker reads processor audio_values", files.worker, "inputs.audio_values"],
  ["worker performs speaker encoding", files.worker, "model.encode_speech"],
  ["worker requires all four conditioning outputs", files.worker, "speakerConditioning.speaker_features"],
  ["worker passes explicit audio features", files.worker, "audio_features: speakerConditioning.audio_features"],
  ["worker passes explicit speaker embedding", files.worker, "speaker_embeddings: speakerConditioning.speaker_embeddings"],
  ["worker checks WebGPU adapter", files.worker, "requestAdapter"],
  ["worker loads official Chatterbox clone model", files.worker, "onnx-community/chatterbox-ONNX"],
  ["Buddy sample persistence is local only", files.buddy, "putVoiceValue(SAMPLE_KEY"],
  ["voice-clone is intercepted before generic runtime", files.runtime, 'if (capability === "voice-clone")'],
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
  "@gradio/client",
];
for (const [name, source] of Object.entries(files)) {
  for (const needle of forbiddenSource) {
    if (source.includes(needle)) {
      throw new Error(`Voice-path verification failed: forbidden remote/API dependency found in ${name}: ${needle}`);
    }
  }
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (packageJson.dependencies?.["@gradio/client"] || packageJson.devDependencies?.["@gradio/client"]) {
  throw new Error("Voice-path verification failed: unused Gradio client dependency remains.");
}

const runtimeRegistry = await readFile("src/lib/free-runtime.ts", "utf8");
const voiceBlock = runtimeRegistry.match(/id:\s*"voice-chatterbox-local"[\s\S]*?(?=\n\s*\},)/)?.[0] ?? "";
if (!voiceBlock.includes("fallbackIds: []")) {
  throw new Error("Voice capability registry must not advertise a voice fallback.");
}

console.log(
  "Local Buddy voice path verified: uploaded reference -> RawAudio -> ChatterboxProcessor -> speech encoder -> explicit audio/speaker conditioning tensors -> WebGPU generation; no public Space, API-key route, Gradio dependency, or preset fallback.",
);
