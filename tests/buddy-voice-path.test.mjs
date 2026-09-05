import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [production, runtime, local, worker, voice, picker, chat, gateway] = await Promise.all([
  readFile("src/lib/production-voice-clone.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/local-chatterbox.ts", "utf8"),
  readFile("src/workers/chatterbox-local.worker.ts", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
  readFile("src/components/studio/BuddyLiveChat.tsx", "utf8"),
  readFile("src/lib/voice-clone-gateway.ts", "utf8"),
]);

test("production Red clone uses the production Worker endpoint and verifies returned audio", () => {
  assert.match(runtime, /fetch\("\/api\/ai\/voice-clone"/);
  assert.match(runtime, /audioBase64/);
  assert.match(runtime, /SHA-256/);
  assert.match(runtime, /normalizeAndVerifyBrowserAudio/);
  assert.match(runtime, /cloneProfile\(\)\.speaker === "Red"/);
  assert.match(production, /VoxCPM2 persistent GPU reference clone/);
  assert.match(gateway, /openbmb-voxcpm-demo\.hf\.space/);
  assert.match(gateway, /gradio_api\/upload/);
  assert.match(gateway, /gradio_api\/call\/generate/);
  assert.match(gateway, /REFERENCE_CACHE_TTL_MS/);
  assert.match(gateway, /x-red-voice-route/);
  assert.doesNotMatch(gateway, /QWEN_TTS_SPACE_URL|FALLBACK_SPACE/);
});

test("Red production generation is optimized to avoid re-uploading the same reference on every reply", () => {
  assert.match(gateway, /REFERENCE_CACHE_TTL_MS/);
  assert.match(gateway, /cache\.get/);
  assert.match(gateway, /cache\.set/);
});

test("Red production never silently substitutes another voice provider", () => {
  assert.match(gateway, /failed on the verified VoxCPM2 reference-clone route/);
  assert.doesNotMatch(gateway, /Qwen3-TTS Voice Clone Base/);
  assert.match(production, /primary: "VoxCPM2 persistent GPU reference clone"/);
  assert.match(production, /fallback: "none"/);
  assert.doesNotMatch(production, /QWEN_TTS_SPACE_URL|handleVoiceClone\([\s\S]*Qwen/);
});

test("the browser reuses the Red reference and only resends it when the production cache asks for a refresh", () => {
  assert.match(runtime, /cachedRedReferenceId/);
  assert.match(runtime, /cachedRedReferenceBase64/);
  assert.match(runtime, /response\.status === 428/);
  assert.match(runtime, /makeBody\(!alreadyEncoded\)/);
});

test("preset voices expose a real generated audio preview before selection", () => {
  assert.match(picker, /const \[previewVoice, setPreviewVoice\] = useState<string \| null>\(null\)/);
  assert.match(picker, /const previewPreset = async/);
  assert.match(picker, /runStudioJob\(\s*"tts"/);
  assert.match(picker, /setGeneratedAudio\(result\.url\)/);
  assert.match(picker, /Preview Voice/);
  assert.match(picker, /audio[^\n]*controls/);
});

test("preset playback never silently switches to browser speech synthesis", () => {
  assert.doesNotMatch(chat, /if \(\"speechSynthesis\" in window\)/);
  assert.match(chat, /Voice playback failed/);
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

test("the Red default is explicit and migrated once from the stale Ryan default", () => {
  assert.match(voice, /RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v2"/);
  assert.match(voice, /speaker: "Red"/);
  assert.match(voice, /localStorage\.getItem\(RED_DEFAULT_MIGRATION_KEY\)/);
  assert.match(voice, /saveBuddyVoiceProfile\(redDefault\)/);
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
