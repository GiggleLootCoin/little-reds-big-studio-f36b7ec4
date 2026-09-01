import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSpeechLanguage } from "../src/worker.ts";

test("normalizes friendly English language names for Workers AI Whisper", () => {
  assert.equal(normalizeSpeechLanguage("English"), "en");
  assert.equal(normalizeSpeechLanguage("en"), "en");
  assert.equal(normalizeSpeechLanguage("Auto"), undefined);
});
