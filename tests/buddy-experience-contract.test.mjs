import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [picker, chat, agent, voice, runtime] = await Promise.all([
  readFile("src/components/studio/BuddyVoicePicker.tsx", "utf8"),
  readFile("src/components/studio/BuddyLiveChat.tsx", "utf8"),
  readFile("src/lib/buddy-agent.ts", "utf8"),
  readFile("src/lib/buddy-voice.ts", "utf8"),
  readFile("src/lib/studio-runtime.ts", "utf8"),
]);

test("Red personal voice is a visible preset choice and remains clone-routed", () => {
  assert.match(picker, /id: "Red"[\s\S]*?family: "Red — Your Voice"/);
  assert.match(picker, /speaker: "Red"/);
  assert.match(chat, /v\.mode === "clone" \|\| v\.speaker === "Red"/);
});

test("saved Red voice is selected without hiding the preset voice list", () => {
  assert.match(picker, /speaker: "Red"/);
  assert.match(picker, /mode: "preset" as const/);
});

test("preset voices are not silently replaced by a saved Red sample", () => {
  assert.match(runtime, /profile\.speaker === "Red"/);
  assert.match(runtime, /input\.speaker === "Red"/);
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
