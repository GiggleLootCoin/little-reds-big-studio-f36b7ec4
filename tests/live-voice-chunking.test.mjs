import test from "node:test";
import assert from "node:assert/strict";
import { splitLiveVoiceText } from "../src/lib/real-voice-clone-v2.ts";

test("live voice splits long replies into complete speech chunks", () => {
  const text = "First sentence arrives quickly. Second sentence follows naturally. Third sentence keeps the whole reply intact.";
  assert.deepEqual(splitLiveVoiceText(text, 45), [
    "First sentence arrives quickly.",
    "Second sentence follows naturally.",
    "Third sentence keeps the whole reply intact.",
  ]);
});

test("short live voice replies stay as one chunk", () => {
  assert.deepEqual(splitLiveVoiceText("Hello Red.", 120), ["Hello Red."]);
});
