import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, gateway, picker, chat, voice, server] = await Promise.all([
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/voice-clone-gateway.ts", "utf8"),
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
  readFile("src/components/studio/BuddyLiveChat.tsx", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/server.ts", "utf8"),
]);

test("production Red clone uses the Worker endpoint and verifies returned audio", () => {
  assert.match(runtime, /fetch\("\/api\/ai\/voice-clone"/);
  assert.match(runtime, /audioBase64/);
  assert.match(runtime, /SHA-256/);
  assert.match(runtime, /normalizeAndVerifyBrowserAudio/);
  assert.match(runtime, /wantsRedVoice/);
  assert.match(runtime, /runProductionRedClone/);
  assert.match(gateway, /Qwen3-TTS reference clone/);
  assert.match(gateway, /https:\/\/qwen-qwen3-tts\.hf\.space/);
  assert.match(gateway, /gradio_api\/upload/);
  assert.match(gateway, /gradio_api\/call\/generate_voice_clone/);
  assert.match(gateway, /REFERENCE_CACHE_TTL_MS/);
  assert.match(gateway, /x-red-voice-route.*qwen3-tts-reference-clone/);
  assert.doesNotMatch(gateway, /openbmb-voxcpm-demo\.hf\.space/);
});

test("Qwen clone uses reference text when available and x-vector-only mode otherwise", () => {
  assert.match(gateway, /refText/);
  assert.match(gateway, /!refText/);
  assert.match(gateway, /1\.7B/);
  assert.match(gateway, /generate_voice_clone/);
});

test("Qwen SSE completion must yield real audio, not a silent substitution", () => {
  assert.match(gateway, /parseQwenTTSSSE/);
  assert.match(gateway, /Qwen3-TTS completed without cloned audio/);
  assert.match(gateway, /Qwen3-TTS returned no playable cloned audio artifact/);
  assert.doesNotMatch(gateway, /speechSynthesis/);
});

test("Red reference is cached and busy Qwen queues are retried", () => {
  assert.match(gateway, /cache\.get/);
  assert.match(gateway, /cache\.set/);
  assert.match(gateway, /QWEN_QUEUE_RETRY_DELAYS_MS = \[1500, 4000, 8000\]/);
  assert.match(gateway, /generateWithQueueRetry/);
});

test("cached Red references always send audio so a fresh Worker isolate cannot break cloning", () => {
  assert.match(runtime, /audioBase64:\s*cachedReferenceBase64/);
  assert.doesNotMatch(runtime, /\.\.\.\(includeAudio \? \{ audioBase64: cachedReferenceBase64 \} : \{\}\)/);
});

test("preset voices expose generated previews before selection", () => {
  assert.match(picker, /const previewPreset = async/);
  assert.match(picker, /runStudioJob\(\s*"tts"/);
  assert.match(picker, /setGeneratedAudio\(result\.url\)/);
  assert.match(picker, /Preview Voice/);
  assert.match(picker, /audio[^\n]*controls/);
  assert.doesNotMatch(chat, /if \("speechSynthesis" in window\)/);
});

test("Red remains the explicit default and presets use Aura-2 English", () => {
  assert.match(voice, /RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v2"/);
  assert.match(voice, /speaker: "Red"/);
  assert.match(server, /@cf\/deepgram\/aura-2-en/);
  assert.doesNotMatch(server, /@cf\/deepgram\/aura-1/);
});
