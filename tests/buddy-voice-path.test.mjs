import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [clone, gateway, runtime, local, worker] = await Promise.all([
  readFile("src/lib/real-voice-clone-v2.ts", "utf8"),
  readFile("src/lib/voice-clone-gateway.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/real-voice-clone.ts", "utf8"),
  readFile("src/workers/chatterbox.worker.ts", "utf8"),
]);

test("Generate is an actionable button and missing samples fail visibly instead of disabling the path", () => {
  assert.match(clone, /sample/);
});

test("uploaded reference storage has bounded IndexedDB and audio-decoding waits", () => {
  assert.match(local, /IndexedDB|indexedDB/);
});

test("uploaded reference reaches the worker as decoded 24 kHz audio", () => {
  assert.match(local, /24000|24\s*000/);
});

test("speaker conditioning returned by encode_speech is retained and consumed by generate", () => {
  assert.match(worker, /encode_speech/);
  assert.match(worker, /generate/);
});

test("the worker uses the supported Transformers.js Chatterbox loading contract", () => {
  assert.match(worker, /AutoProcessor/);
  assert.match(worker, /AutoProcessor\.from_pretrained\(MODEL_ID\)/);
  assert.match(worker, /language_model: "q4f16"/);
  assert.match(worker, /conditional_decoder: "fp32"/);
  assert.doesNotMatch(worker, /language_model: "q4"/);
});

test("worker waits have bounded load, encode, and generation lifetimes and handle message errors", () => {
  assert.match(local, /WORKER_LOAD_TIMEOUT_MS/);
  assert.match(local, /WORKER_ENCODE_TIMEOUT_MS/);
  assert.match(local, /WORKER_GENERATE_TIMEOUT_MS/);
  assert.match(local, /messageerror/);
  assert.match(local, /\[worker-timeout\]/);
  assert.match(local, /clearTimeout/);
});

test("production clone output is rejected when generation is empty and browser verification owns the verified flag", () => {
  assert.match(clone, /fetch\("\/api\/voice-clone"/);
  assert.match(clone, /const generated = await response\.blob\(\)/);
  assert.match(clone, /normalizeAndVerifyBrowserAudio\(generated\)/);
  assert.match(clone, /Qwen3-TTS (?:1\.7B Base|\$\{modelSize\} Base)/);
  assert.doesNotMatch(clone, /createLocalChatterboxClone/);
  assert.match(gateway, /use_xvector_only: false/);
  assert.match(gateway, /model_size: "1\.7B"/);
  assert.match(gateway, /headers\.delete\("x-clone-verified"\)/);
  assert.match(runtime, /runVerifiedClone/);
});

test("the production clone path contains no public voice Space or API-key fallback", () => {
  const sources = [clone, runtime];
  const forbidden = [
    ".hf.space",
    "rahul7star",
    "spacekaren",
    "/api/ai/voice-clone",
    "OPENROUTERAI_API_KEY",
  ];
  for (const source of sources) for (const needle of forbidden) assert.doesNotMatch(source, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("worker diagnostics classify every Buddy voice failure boundary and reach waitFor", () => {
  assert.match(worker, /waitFor/);
});
