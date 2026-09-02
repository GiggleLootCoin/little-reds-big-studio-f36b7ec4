import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const [chat, redVoice, runtime, defaultVoice] = await Promise.all([
  readFile("src/components/studio/BuddyLiveChat.tsx", "utf8"),
  readFile("src/lib/buddy-red-voice.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("src/lib/red-default-voice.ts", "utf8"),
]);

test("BuddyLiveChat routes Red through the dedicated reference-audio path, never the provider pool", () => {
  assert.match(chat, /speakAsBuddyRed/);
  assert.match(chat, /isRedVoice\(v\)/);
  assert.doesNotMatch(chat, /runStudioJob\(\s*\n?\s*"voice-clone"/);
});

test("non-Red preset voices still use the normal tts route", () => {
  assert.match(chat, /runStudioJob\(\s*\n?\s*"tts"/);
  assert.match(chat, /speaker: v\.speaker/);
});

test("the Red path sends reference audio to the proven /api/voice-clone gateway", () => {
  assert.match(redVoice, /createBestFreeVoiceClone/);
  assert.match(redVoice, /resolveRedReference/);
  assert.match(redVoice, /getBuiltInRedVoiceSample/);
});

test("the Red path fails honestly instead of falling back to a demo voice", () => {
  assert.doesNotMatch(redVoice, /runStudioJob/);
  assert.doesNotMatch(redVoice, /from "\.\/(local-)?chatterbox[^"]*"/i);
  assert.doesNotMatch(redVoice, /speechSynthesis/);
  assert.match(redVoice, /could not be loaded, so no speech was generated/);
});

test("studio-runtime default Red clone path uses the same dedicated engine", () => {
  assert.match(runtime, /speakAsBuddyRed/);
  assert.doesNotMatch(runtime, /_skipProviders: \["hf-qwen3-tts", "hf-chatterbox"\]/);
});

test("the built-in Red reference audio is actually served from public/", async () => {
  const match = defaultVoice.match(/BUILT_IN_RED_VOICE_URL = "([^"]+)"/);
  assert.ok(match, "built-in Red voice URL must be declared");
  const info = await stat(`public${match[1]}`);
  assert.ok(info.size > 100000, "Red reference audio must be a real recording");
});
