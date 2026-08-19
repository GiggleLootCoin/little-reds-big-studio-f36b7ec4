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
const qwen = await read("src/lib/qwen3-tts-clone.ts");
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

test("legacy Chatterbox reference conditioning remains intact but is no longer the production clone engine", () => {
  assert.match(local, /decodeAt24k\(reference\)/);
  assert.match(worker, /type: "encode"/);
  assert.match(worker, /model\.encode_speech/);
  assert.match(worker, /model\.generate/);
  assert.match(worker, /language_model: "q4f16"/);
  assert.match(worker, /conditional_decoder: "fp32"/);
});

test("Buddy's production clone engine is Qwen3-TTS Base and does not import Chatterbox", () => {
  assert.match(clone, /createQwen3TTSClone\(sample, refText, text/);
  assert.doesNotMatch(clone, /createLocalChatterboxClone/);
  assert.match(clone, /Qwen3-TTS Base/);
  assert.match(runtime, /createBestFreeVoiceClone/);
});

test("Qwen3-TTS uses the official Qwen Space and the 0.6B Base model", () => {
  assert.match(qwen, /const SPACE_ID = "Qwen\/Qwen3-TTS"/);
  assert.match(qwen, /const MODEL_SIZE = "0\.6B"/);
  assert.match(qwen, /Client\.connect/);
  assert.match(qwen, /\/generate_voice_clone/);
  assert.match(qwen, /Qwen3-TTS Base/);
});

test("Qwen receives the actual reference recording and exact reference transcript", () => {
  assert.match(qwen, /handle_file\(sample\)/);
  assert.match(qwen, /reference,\n\s*refText\.trim\(\)/);
  assert.match(qwen, /false,\n\s*MODEL_SIZE/);
  assert.match(clone, /refText\.trim\(\)/);
});

test("Qwen output must be real audio and is verified before clone success", () => {
  assert.match(qwen, /Qwen returned an empty audio file/);
  assert.match(qwen, /Qwen returned an empty waveform/);
  assert.match(qwen, /normalizeAndVerifyBrowserAudio/);
  assert.match(qwen, /Qwen3-TTS returned silent or unusable audio/);
  assert.match(qwen, /Android audio-element verification/);
  assert.match(clone, /Qwen3-TTS returned silent or unusable audio/);
});

test("Qwen failures cannot become preset-voice success", () => {
  assert.doesNotMatch(clone, /speaker/);
  assert.doesNotMatch(clone, /preset/);
  assert.doesNotMatch(qwen, /generate_custom_voice/);
  assert.match(qwen, /throw new Error/);
});

test("Qwen request and output waits are bounded", () => {
  assert.match(qwen, /REQUEST_TIMEOUT_MS/);
  assert.match(qwen, /\[qwen-timeout\]/);
  assert.match(qwen, /clearTimeout/);
});

test("legacy Chatterbox worker diagnostics remain available for isolated legacy code", () => {
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
  assert.match(local, /event\.data\.type === "error"/);
  assert.match(local, /String\(event\.data\.message/);
});

test("the existing Buddy runtime still exposes a verified playable artifact", () => {
  assert.match(runtime, /if \(!result\.url\) throw new Error/);
  assert.match(runtime, /markBuddyCloneVerified/);
  assert.match(runtime, /result\.provider/);
});
