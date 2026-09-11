import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, gateway, picker, chat, voice, server, previews] = await Promise.all([
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/voice-clone-gateway.ts", "utf8"),
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
  readFile("src/components/studio/BuddyLiveChat.tsx", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/server.ts", "utf8"),
  readFile("src/lib/stored-preset-previews.ts", "utf8"),
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
  assert.match(gateway, /0\.6B/);
  assert.match(gateway, /1\.7B/);
  assert.match(gateway, /generate_voice_clone/);
});

test("Qwen clone defaults to the fast free 0.6B model and gates 1.7B behind an explicit opt-in", () => {
  assert.match(gateway, /body\.modelSize === "1\.7B" && body\.allowHighQuality === true \? "1\.7B" : "0.6B"/);
});

test("Qwen SSE completion must yield real audio, not a silent substitution", () => {
  assert.match(gateway, /parseQwenTTSSSE/);
  assert.match(gateway, /Qwen3-TTS completed without cloned audio/);
  assert.match(gateway, /Qwen3-TTS returned no playable cloned audio artifact/);
  assert.doesNotMatch(chat, /if \("speechSynthesis" in window\)/);
});

test("Red reference is cached and busy Qwen queues are retried", () => {
  assert.match(gateway, /cache\.get/);
  assert.match(gateway, /cache\.set/);
  assert.match(gateway, /QWEN_QUEUE_RETRY_DELAYS_MS = \[1500, 4000, 8000\]/);
  assert.match(gateway, /generateWithQueueRetry/);
});

test("cached Red references always send audio so a fresh Worker isolate cannot break cloning", () => {
  assert.match(runtime, /audioBase64:\s*cachedRedReferenceBase64/);
  assert.doesNotMatch(runtime, /\.\.\.\(includeAudio \? \{ audioBase64: cachedRedReferenceBase64 \} : \{\}\)/);
});

test("Qwen clone normalizes common language codes to the official Space language names", () => {
  assert.match(gateway, /normalizeQwenLanguage/);
  assert.match(gateway, /en:\s*"English"/);
  assert.match(gateway, /normalizeQwenLanguage\(body\.language\)/);
});

test("Qwen FileData matches the current Gradio input contract", () => {
  assert.match(gateway, /size:/);
  assert.match(gateway, /is_stream:\s*false/);
  assert.match(gateway, /meta:\s*\{ _type: "gradio\.FileData" \}/);
});

test("Qwen terminal null errors are treated as transient upstream failures", () => {
  assert.match(gateway, /message === "null"/);
  assert.match(gateway, /Qwen3-TTS upstream returned a terminal null error/);
  assert.match(gateway, /isRetryableQueueError\(error\)/);
});

test("preset voice previews use stored assets when available and generate the selected speaker when missing", () => {
  assert.match(picker, /const previewPreset = async \(\) =>/);
  assert.match(picker, /getStoredPresetPreview\(speaker\)/);
  assert.match(picker, /setGeneratedAudio\(stored\)/);
  assert.match(picker, /speaker === "Red"/);
  assert.doesNotMatch(picker, /runStudioJob\(\s*"voice-clone".*PREVIEW_TEXT/s);
  assert.match(picker, /fetch\("\/api\/ai\/tts"/);
  assert.match(picker, /text: PREVIEW_TEXT/);
  assert.match(picker, /target_text: PREVIEW_TEXT/);
  assert.match(picker, /new Audio\(url\)/);
  assert.match(runtime, /input\.previewOnly === true \|\| legacyPreviewRequest/);
  assert.match(runtime, /getStoredPresetPreview\(effectiveSpeaker\)/);
  assert.match(previews, /Red:\s*"\/red_voice_mic_device10_30s_C\.wav"/);
  assert.match(previews, /Ryan:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Aiden:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Vivian:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Serena:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Uncle_Fu:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Dylan:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Eric:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Ono_Anna:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /Sohee:\s*"https:\/\/huggingface\.co/);
  assert.match(previews, /NORMALIZED_PRESET_ALIASES/);
  assert.match(previews, /"aura-2-luna-en":\s*"Ryan"/);
  assert.match(previews, /"aura-2-orpheus-en":\s*"Aiden"/);
  assert.match(previews, /"aura-2-athena-en":\s*"Vivian"/);
  assert.doesNotMatch(chat, /if \("speechSynthesis" in window\)/);
});

test("Red remains the explicit default and presets use Aura-2 English", () => {
  assert.match(voice, /RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v2"/);
  assert.match(voice, /speaker: "Red"/);
  assert.match(server, /@cf\/deepgram\/aura-2-en/);
  assert.doesNotMatch(server, /@cf\/deepgram\/aura-1/);
});
