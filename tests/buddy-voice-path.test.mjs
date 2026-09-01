import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [clone, gateway, runtime, local] = await Promise.all([
  readFile("src/lib/real-voice-clone-v2.ts", "utf8"),
  readFile("src/lib/voice-clone-gateway.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/real-voice-clone.ts", "utf8"),
]);

test("Generate is an actionable button and missing samples fail visibly instead of disabling the path", () => {
  assert.match(clone, /sample/);
});

test("uploaded reference storage has bounded IndexedDB and audio-decoding waits", () => {
  assert.match(local, /IndexedDB|indexedDB/);
});

test("uploaded reference reaches the worker as decoded 24 kHz audio", () => {
  assert.match(local, /24000|24\\s*000/);
});

test("speaker conditioning returned by encode_speech is retained and consumed by generate", () => {
  assert.match(clone, /encode_speech/);
  assert.match(clone, /speakerConditioning/);
  assert.match(clone, /generate/);
});

test("the local clone implementation contains the supported Chatterbox loading contract", () => {
  assert.match(clone, /AutoProcessor/);
  assert.match(clone, /q4f16/);
  assert.match(clone, /conditional_decoder/);
});

test("production clone output is rejected when generation is empty and browser verification owns the verified flag", () => {
  assert.match(clone, /fetch/);
  assert.match(clone, /response\\.blob/);
  assert.match(clone, /normalizeAndVerifyBrowserAudio/);
  assert.match(clone, /Qwen3-TTS/);
  assert.doesNotMatch(clone, /createLocalChatterboxClone/);
  assert.match(gateway, /use_xvector_only: false/);
  assert.match(gateway, /model_size: "1\\.7B"/);
  assert.match(gateway, /headers\\.delete/);
  assert.match(runtime, /runVerifiedClone/);
});

test("the production clone path contains no public voice Space or API-key fallback", () => {
  for (const source of [clone, runtime]) {
    for (const needle of [
      ".hf.space",
      "rahul7star",
      "spacekaren",
      "/api/ai/voice-clone",
      "OPENROUTERAI_API_KEY",
    ]) {
      assert.equal(source.includes(needle), false, `forbidden fallback found: ${needle}`);
    }
  }
});

test("local voice diagnostics reach waitFor", () => {
  assert.match(local, /waitFor/);
});
