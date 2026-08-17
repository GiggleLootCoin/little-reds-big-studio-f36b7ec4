import { readFile } from "node:fs/promises";

const files = {
  clone: await readFile("src/lib/real-voice-clone-v2.ts", "utf8"),
  local: await readFile("src/lib/local-chatterbox.ts", "utf8"),
  worker: await readFile("src/workers/chatterbox-local.worker.ts", "utf8"),
};

const required = [
  ["clone imports local engine", files.clone, "createLocalChatterboxClone"],
  ["clone passes uploaded reference", files.clone, "createLocalChatterboxClone(sample, text"],
  ["local API accepts Blob reference", files.local, "reference: Blob"],
  ["reference is decoded before conditioning", files.local, "decodeAt24k(reference)"],
  ["reference is sent to encoder worker", files.local, 'type: "encode"'],
  ["worker performs speaker encoding", files.worker, "model.encode_speech"],
  ["worker uses encoded speaker data for generation", files.worker, "...speakerData"],
  ["worker checks WebGPU adapter", files.worker, "requestAdapter"],
  ["worker loads Chatterbox Turbo", files.worker, "ttslab/chatterbox-turbo-webgpu"],
];

for (const [label, source, needle] of required) {
  if (!source.includes(needle)) throw new Error(`Voice-path verification failed: ${label}`);
}

const forbidden = [
  ".hf.space",
  "rahul7star",
  "spacekaren",
  "/api/ai/voice-clone",
  "OPENROUTERAI_API_KEY",
];
for (const [name, source] of Object.entries(files)) {
  for (const needle of forbidden) {
    if (source.includes(needle)) {
      throw new Error(
        `Voice-path verification failed: forbidden remote/API-key dependency found in ${name}: ${needle}`,
      );
    }
  }
}

const runtime = await readFile("src/lib/free-runtime.ts", "utf8");
const voiceBlock = runtime.match(/id:\s*"voice-chatterbox-local"[\s\S]*?(?=\n\s*\},)/)?.[0] ?? "";
if (!voiceBlock.includes("fallbackIds: []")) {
  throw new Error("Voice capability registry must not advertise a voice fallback.");
}

console.log(
  "Local Buddy voice path verified statically: reference recording -> Chatterbox speaker conditioning -> WebGPU generation, with no public Space or user API key fallback.",
);
