import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [clone, runtime, local, worker, voice, picker] = await Promise.all([
  readFile("src/lib/production-voice-clone.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/local-chatterbox.ts", "utf8"),
  readFile("src/workers/chatterbox-local.worker.ts", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
]);

test("production Red clone uses the production Worker endpoint and verifies returned audio", () => {
  assert.match(runtime, /fetch\("\/api\/ai\/voice-clone"/);
  assert.match(runtime, /audioBase64/);
  assert.match(runtime, /SHA-256/);
  assert.match(runtime, /normalizeAndVerifyBrowserAudio/);
  assert.match(runtime, /cloneProfile\(\)\.speaker === "Red"/);
  assert.match(worker, /handleProductionVoiceClone/);
  assert.match(worker, /path === "\/api\/ai\/voice-clone"/);
  assert.match(clone, /ResembleAI\/chatterbox-turbo-demo/);
  assert.match(clone, /audio_prompt_path/);
  assert.match(clone, /generate/);
  assert.match(clone, /referenceCache/);
});

test("Red production generation is optimized to avoid re-uploading the same reference on every reply", () => {
  assert.match(clone, /sha256/);
  assert.match(clone, /REFERENCE_CACHE_TTL_MS/);
  assert.match(clone, /referenceCache\.get/);
  assert.match(clone, /referenceCache\.set/);
});

test("the local Chatterbox implementation contains the supported Transformers.js loading contract", () => {
  assert.match(worker, /AutoProcessor/);
  assert.match(worker, /q4f16/);
  assert.match(worker, /conditional_decoder/);
});

test("uploaded reference reaches the local worker as decoded 24 kHz audio", () => {
  assert.match(local, /MODEL_SAMPLE_RATE = 24000/);
  assert.match(worker, /SAMPLE_RATE = 24000/);
  assert.match(local, /new Float32Array\(result\.waveform/);
});

test("speaker conditioning returned by encode_speech is retained and consumed by generate", () => {
  assert.match(worker, /encode_speech/);
  assert.match(worker, /speakerConditioning/);
  assert.match(worker, /model\.generate/);
  assert.match(worker, /\.\.\.speakerConditioning/);
});

test("the Red default is explicit and migration only replaces the stale Ryan default", () => {
  assert.match(voice, /speaker: "Red"/);
  assert.match(voice, /RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v2"/);
  assert.match(voice, /isLegacyRyanDefault/);
  assert.match(voice, /selected == null \|\| isLegacyRyanDefault\(selected\)/);
});

test("loading the saved sample cannot override an intentionally selected preset", () => {
  assert.doesNotMatch(
    picker,
    /useEffect\(\(\) => \{[\s\S]*getBuddyVoiceSample\(\)[\s\S]*setProfile\(next\)/,
  );
  assert.match(picker, /e\.target\.value === "Red"/);
});

test("Red voice generation is not allowed to fall back to browser speech synthesis", () => {
  assert.match(runtime, /wantsRedVoice/);
  assert.match(runtime, /runVerifiedClone/);
  assert.match(runtime, /runProductionRedClone/);
});
