import test from "node:test";
import assert from "node:assert/strict";

const { buildPresetTtsRequest } = await import("../src/lib/buddy-preset-voice-routing.ts");

test("an explicitly selected preset always produces a preset TTS request, never a Red clone request", () => {
  const request = buildPresetTtsRequest({
    mode: "clone",
    speaker: "apollo",
    language: "English",
    mood: "natural",
    tone: "conversational",
  }, "Hello from Mason.");

  assert.equal(request.route, "preset");
  assert.equal(request.speaker, "apollo");
  assert.equal(request.text, "Hello from Mason.");
  assert.equal(request.refAudio, undefined);
});

// Regression: a stale clone mode must not override an explicit preset speaker.
