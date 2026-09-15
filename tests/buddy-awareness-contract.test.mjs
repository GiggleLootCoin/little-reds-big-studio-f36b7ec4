import test from "node:test";
import assert from "node:assert/strict";
import { getBuddyAwarenessCapabilities } from "../src/lib/buddy-awareness.ts";

test("Buddy reports camera awareness only when the browser exposes camera capture", () => {
  const capabilities = getBuddyAwarenessCapabilities({
    mediaDevices: { getUserMedia() {} },
    getDisplayMedia: undefined,
  });

  assert.equal(capabilities.camera, true);
  assert.equal(capabilities.screen, false);
});

test("Buddy reports screen awareness only when display capture exists", () => {
  const capabilities = getBuddyAwarenessCapabilities({
    mediaDevices: undefined,
    getDisplayMedia() {},
  });

  assert.equal(capabilities.camera, false);
  assert.equal(capabilities.screen, true);
});
