import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, engine, gateway, picker, chat, voice, server, previews, routing, twa] = await Promise.all([
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/little-red-engine.ts", "utf8"),
  readFile("src/lib/voice-clone-gateway.ts", "utf8"),
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
  readFile("src/components/studio/BuddyLiveChat.tsx", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/server.ts", "utf8"),
  readFile("src/lib/stored-preset-previews.ts", "utf8"),
  readFile("src/lib/buddy-preset-voice-routing.ts", "utf8"),
  readFile("twa/twa-manifest.json", "utf8"),
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

test("Little Red Engine is the stable capability boundary", () => {
  assert.match(engine, /export async function runLittleRedJob/);
  assert.match(engine, /privacy\?: "private" \| "personal" \| "community" \| "public"/);
  assert.match(engine, /Community processing requires explicit user authorization/);
  assert.match(picker, /runLittleRedJob/);
  assert.doesNotMatch(picker, /import \{ runStudioJob \} from "@\/lib\/studio-runtime"/);
});

test("Qwen clone uses reference text when available and x-vector-only mode otherwise", () => {
  assert.match(gateway, /refText/);
  assert.match(gateway, /!refText/);
  assert.match(gateway, /0\.6B/);
  assert.match(gateway, /1\.7B/);
  assert.match(gateway, /generate_voice_clone/);
});

test("Qwen clone defaults to the fast free 0.6B model and gates 1.7B behind an explicit opt-in", () => {
  assert.match(gateway, /body\.modelSize === "1\.7B" && body\.allowHighQuality === true \? "1\.7B" : "0\.6B"/);
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

test("preset voice previews are playback-only and only expose assets that actually exist", () => {
  assert.match(picker, /const previewPreset = async \(\) =>/);
  assert.match(picker, /const storedPreview = getStoredPresetPreview\(speaker\)/);
  assert.match(picker, /setGeneratedAudio\(storedPreview\)/);
  assert.match(picker, /new Audio\(storedPreview\)/);
  assert.match(picker, /Preview will not generate audio/);
  const previewBlock = picker.slice(picker.indexOf("const previewPreset"), picker.indexOf("const test", picker.indexOf("const previewPreset")));
  assert.doesNotMatch(previewBlock, /fetch\("\/api\/ai\/tts"/);
  assert.doesNotMatch(previewBlock, /runLittleRedJob/);
  assert.doesNotMatch(previewBlock, /runStudioJob/);
  assert.doesNotMatch(previewBlock, /PREVIEW_TEXT/);
  assert.doesNotMatch(runtime, /legacyPreviewRequest/);
  assert.doesNotMatch(runtime, /input\.previewOnly === true/);
  for (const speaker of ["Red", "Ryan", "Aiden", "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ono_Anna", "Sohee"]) {
    assert.match(previews, new RegExp(`${speaker}:`));
  }
  assert.doesNotMatch(previews, /NORMALIZED_PRESET_ALIASES/);
  assert.doesNotMatch(previews, /aura-2-luna-en/);
  assert.doesNotMatch(previews, /aura-2-orpheus-en/);
  assert.doesNotMatch(previews, /aura-2-athena-en/);
  assert.doesNotMatch(previews, /atlas.*Uncle_Fu/);
  assert.doesNotMatch(chat, /if \("speechSynthesis" in window\)/);
});

test("Red remains the explicit default and presets use Aura-2 English", () => {
  assert.match(voice, /RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v2"/);
  assert.match(voice, /speaker: "Red"/);
  assert.match(server, /@cf\/deepgram\/aura-2-en/);
  assert.doesNotMatch(server, /@cf\/deepgram\/aura-1/);
});

test("preset TTS canonicalizes both raw Aura names and full Aura-2 IDs", () => {
  assert.match(routing, /function normalizeBuddyPresetSpeaker\(value: string\)/);
  assert.match(routing, /aura-2-\(\[a-z0-9_\]\+\)-\(en\|es\)/);
  assert.match(routing, /return match \? match\[1\] : speaker/);
  assert.match(routing, /const speaker = normalizeBuddyPresetSpeaker\(profile\.speaker\)/);
});

test("Android TWA does not intentionally pin stale cached Studio assets", () => {
  assert.match(twa, /"enableCache": false/);
});
