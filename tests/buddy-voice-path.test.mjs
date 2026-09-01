import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

const picker = await read("src/components/studio/BuddyVoicePicker.tsx");
const buddyVoice = await read("src/lib/buddy-voice.ts");
const localReference = await read("src/lib/local-voice-reference.ts");
const local = await read("src/lib/local-chatterbox.ts");
const worker = await read("src/workers/chatterbox-local.worker.ts");
const clone = await read("src/lib/real-voice-clone-v2.ts");
const gateway = await read("src/lib/voice-clone-gateway.ts");
const runtime = await read("src/lib/studio-runtime.ts");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Generate is an actionable button and missing samples fail visibly instead of disabling the path", () => {
  assert.match(picker, /<StudioButton[\s\S]*?type="button"[\s\S]*?onClick=\{handleGenerateClick\}/);
  assert.match(picker, /disabled=\{busy \|\| recording\}/);
  assert.doesNotMatch(picker, /disabled=\{busy \|\| recording \|\| !profile\.referenceName\}/);
  assert.match(picker, /const handleGenerateClick = \(\) =>/);
  assert.match(picker, /\[BuddyVoiceDiagnostic\] GENERATE_CLICKED/);
  assert.match(picker, /\[BuddyVoiceDiagnostic\] TEST_ENTERED/);
  assert.match(picker, /\[BuddyVoiceDiagnostic\] BUSY_STATUS_SET/);
  assert.match(picker, /\{status\}/);
});

test("uploaded reference storage has bounded IndexedDB and audio-decoding waits", () => {
  assert.match(buddyVoice, /withTimeout/);
  assert.match(buddyVoice, /voice-storage/);
  assert.match(buddyVoice, /audio-decode/);
  assert.match(localReference, /withTimeout/);
  assert.match(localReference, /audio-decode/);
  assert.match(localReference, /voice-storage/);
});

test("uploaded reference reaches the worker as decoded 24 kHz audio", () => {
  assert.match(local, /decodeAt24k\(reference\)/);
  assert.match(local, /type: "encode"/);
  assert.match(local, /audio\.buffer/);
  assert.match(worker, /new Tensor\("float32", audio, \[1, audio\.length\]\)/);
});

test("speaker conditioning returned by encode_speech is retained and consumed by generate", () => {
  assert.match(
    worker,
    /const encoded = assertConditioning\(await model\.encode_speech\(reference\)\)/,
  );
  assert.match(worker, /speakerConditioning = encoded/);
  const generation = between(
    worker,
    "const waveform = await model.generate({",
    "});\n    if (!waveform.data",
  );
  assert.match(generation, /\.\.\.speakerConditioning/);
  assert.match(generation, /max_new_tokens: MAX_NEW_TOKENS/);
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
  assert.match(clone, /Qwen3-TTS 1\.7B Base/);
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
  for (const source of sources)
    for (const needle of forbidden)
      assert.equal(source.includes(needle), false, `forbidden fallback: ${needle}`);
});

test("worker diagnostics classify every Buddy voice failure boundary and reach waitFor", () => {
  for (const phase of [
    "webgpu-unavailable",
    "webgpu-adapter",
    "device-memory",
    "model-load",
    "worker-initialization",
    "encode-speech",
    "generate",
  ])
    assert.match(worker, new RegExp(`\\[${phase}\\]`));
  assert.match(local, /event\.data\?\.type === "error"/);
  assert.match(local, /String\(event\.data\.message/);
  assert.match(local, /\[webgpu-unavailable\]/);
  assert.match(local, /\[webgpu-adapter\]/);
  assert.match(local, /\[device-memory\]/);
  assert.match(local, /worker-initialization/);
});
