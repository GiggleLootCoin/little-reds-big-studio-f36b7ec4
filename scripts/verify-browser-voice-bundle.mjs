import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "dist", "client", "assets");
const required = "onnx-community/chatterbox-ONNX";
const requiredMarkers = ["encode_speech", "ChatterboxProcessor", "speakerData"];
const forbidden = [
  "onnxruntime-node",
  "sharp",
  "rahul7star-chatterbox-multilingual-tts.hf.space",
  "spacekaren/chatterbox",
  "remote voice-clone fallback",
  "default voice fallback",
  "/api/ai/voice-clone",
];

const files = await readdir(root);
const workerFiles = files.filter(
  (file) => file.startsWith("chatterbox-local.worker-") && file.endsWith(".js"),
);
if (workerFiles.length !== 1) {
  throw new Error(
    `Expected exactly one production Chatterbox worker asset, found ${workerFiles.length}.`,
  );
}

const workerPath = join(root, workerFiles[0]);
const worker = await readFile(workerPath, "utf8");
if (!worker.includes(required)) {
  throw new Error(`Production Chatterbox worker is missing required model marker: ${required}`);
}
for (const marker of requiredMarkers) {
  if (!worker.includes(marker)) {
    throw new Error(`Production Chatterbox worker is missing required cloning marker: ${marker}`);
  }
}
for (const needle of forbidden) {
  if (worker.includes(needle)) {
    throw new Error(`Production Chatterbox worker contains forbidden marker: ${needle}`);
  }
}

console.log(`Production Chatterbox worker verified: ${workerFiles[0]}`);
console.log(
  "Official Transformers.js Chatterbox voice-cloning model and speaker-conditioning markers are present; Node/native dependencies and remote/preset voice fallback markers are absent from the actual voice worker asset.",
);
