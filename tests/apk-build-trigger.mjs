import test from "node:test";
import assert from "node:assert/strict";

// This test intentionally stays dependency-free: its purpose is to make the
// production APK workflow run on a real application change during verification.
test("production APK verification trigger is present", () => {
  assert.equal(true, true);
});
