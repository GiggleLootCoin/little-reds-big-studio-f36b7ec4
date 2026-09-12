import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [picker, chat, agent, voice, runtime, wrapper, twa, engine] = await Promise.all([
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
  readFile("src/components/studio/BuddyLiveChat.tsx", "utf8"),
  readFile("src/lib/buddy-agent.ts", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
  readFile("scripts/write-worker-wrapper.mjs", "utf8"),
  readFile("twa/twa-manifest.json", "utf8"),
  readFile("src/lib/little-red-engine.ts", "utf8"),
]);

test("Red personal voice is isolated from the stored preset list and remains clone-routed", () => {
  assert.match(voice, /speaker: "Red"/);
  assert.match(picker, /profile\.mode === "preset"/);
  assert.match(picker, /current\.mode === "clone" \|\| current\.speaker === "Red"/);
  assert.match(chat, /v\.speaker === "Red" \|\| \(v\.mode === "clone" \&\& !v\.speaker\)/);
});

test("preset selection is persisted without entering the saved Red clone branch", () => {
  assert.match(picker, /presetCandidate/);
  assert.match(picker, /setPresetCandidate\(e\.target\.value\)/);
  assert.match(picker, /setPresetCandidate\(speaker\)/);
  assert.match(picker, /update\(\{ mode: "preset", speaker: normalizePresetSpeaker\(presetCandidate\) \}\)/);
  assert.match(picker, /runLittleRedJob\("voice-clone"/);
  assert.match(engine, /capability === "voice-clone"/);
  assert.match(engine, /return runStudioJob\("tts", input, options\.onStatus\)/);
});

test("non-Red preset selection cannot enter the saved clone branch", () => {
  assert.match(chat, /v\.speaker === "Red"/);
  assert.doesNotMatch(chat, /if \(v\.mode === "clone" \|\| v\.speaker === "Red"\)/);
});

test("preset voices are not silently replaced by a saved Red sample", () => {
  assert.match(runtime, /effectiveSpeaker === "Red"/);
  assert.match(runtime, /input\.speaker === "Red"/);
  assert.match(runtime, /getBuiltInRedVoiceSample\(\)/);
  assert.match(engine, /Never let the saved Red sample become the/);
});

test("Buddy sends mood and tone into the conversational model instead of storing them as dead UI state", () => {
  assert.match(chat, /mood/);
  assert.match(chat, /tone/);
  assert.match(chat, /getBuddyVoiceProfile\(\)/);
});

test("Buddy sends the selected language to chat and voice generation", () => {
  assert.match(chat, /language: v\.language \|\| "English"/);
  assert.match(chat, /language/);
});

test("Buddy personality explicitly favors natural, concise, fast conversational replies", () => {
  assert.match(agent, /concise|brief|short/i);
  assert.match(agent, /natural|human|conversational/i);
  assert.match(agent, /quick|fast|immediate/i);
});

test("supported language catalog is available to non-English users", () => {
  assert.match(voice, /Chinese/);
  assert.match(voice, /Japanese/);
  assert.match(voice, /Korean/);
  assert.match(voice, /German/);
  assert.match(voice, /French/);
  assert.match(voice, /Spanish/);
});

test("Red default migration only replaces the stale legacy Ryan default", () => {
  assert.match(voice, /RED_DEFAULT_MIGRATION_KEY = "lrbgs-red-default-v2"/);
  assert.match(voice, /isLegacyRyanDefault/);
  assert.match(voice, /selected == null \|\| isLegacyRyanDefault\(selected\)/);
});

test("Buddy chat has a real server-side Qwen route through the deployed Worker wrapper", () => {
  assert.match(wrapper, /path === "\/api\/ai\/chat" && request\.method === "POST"/);
  assert.match(wrapper, /env\.AI\.run\("@cf\/qwen\/qwen3\.8-27b"/);
  assert.match(wrapper, /max_tokens: 320/);
});

test("Buddy production Red voice uses the hardened Cloudflare clone route", () => {
  assert.match(runtime, /fetch\("\/api\/ai\/voice-clone"/);
  assert.match(runtime, /referenceId/);
  assert.match(runtime, /modelSize/);
});

test("the APK uses the exact repository Little Red's Big Studio logo", () => {
  assert.match(twa, /1784996969001\.png/);
  assert.match(twa, /raw\.githubusercontent\.com/);
});
