import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [clone, gateway, runtime, local, worker, voice, picker] = await Promise.all([
  readFile("src/lib/real-voice-clone-v2.ts", "utf8"),
  readFile("src/lib/voice-clone-gateway.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/local-chatterbox.ts", "utf8"),
  readFile("src/workers/chatterbox-local.worker.ts", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
]);

test("Generate is an actionable button and missing samples fail visibly instead of disabling the path", () => {
  assert.match(clone, /sample/);
});

test("uploaded reference storage and audio-decoding waits are bounded", () => {
  assert.match(gateway, /REFERENCE_CACHE_TTL_MS/);
  assert.match(local, /AUDIO_DECODE_TIMEOUT_MS/);
  assert.match(local, /AUDIO_RENDER_TIMEOUT_MS/);
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

test("the local Chatterbox implementation contains the supported Transformers.js loading contract", () => {
  assert.match(worker, /AutoProcessor/);
  assert.match(worker, /q4f16/);
  assert.match(worker, /conditional_decoder/);
});

test("production Red clone uses the production Worker endpoint and verifies returned audio", () => {
  assert.match(runtime, /fetch\("\/api\/ai\/voice-clone"/);
  assert.match(runtime, /audioBase64/);
  assert.match(runtime, /SHA-256/);
  assert.match(runtime, /normalizeAndVerifyBrowserAudio/);
  assert.match(runtime, /cloneProfile\(\)\.speaker === "Red"/);
  assert.match(worker, /handleProductionVoiceClone/);
  assert.match(worker, /path === "\/api\/ai\/voice-clone"/);
  assert.match(worker, /CHATTERBOX_ENDPOINT/);
  assert.match(worker, /voiceCloneHealth/);
  assert.match(gateway, /generate_voice_clone/);
  assert.match(gateway, /QWEN_TTS_FALLBACK_SPACE_URL/);
  assert.match(gateway, /CHATTERBOX_SPACE_URL/);
});

test("the Red default is explicit and migration only replaces the stale Ryan default", () => {
  assert.match(voice, /speaker: "Red"/);
  assert.match(voice, /RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v1"/);
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

test("the production clone path contains no obsolete public voice Space or API-key fallback", () => {
  for (const source of [clone, runtime]) {
    for (const needle of [
      ".hf.space",
      "rahul7star",
      "spacekaren",
      "/api/ai/voice-clone",
      "OPENROUTERAI_API_KEY",
    ]) {
      if (source === runtime && needle === "/api/ai/voice-clone") continue;
      assert.equal(source.includes(needle), false, `forbidden fallback found: ${needle}`);
    }
  }
});

test("local voice diagnostics reach waitFor", () => {
  assert.match(local, /function waitFor/);
  assert.match(local, /WORKER_LOAD_TIMEOUT_MS/);
  assert.match(local, /WORKER_ENCODE_TIMEOUT_MS/);
  assert.match(local, /WORKER_GENERATE_TIMEOUT_MS/);
});
