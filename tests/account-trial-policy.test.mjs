import test from "node:test";
import assert from "node:assert/strict";
import { shouldStartTrial } from "../src/lib/account-trial-policy.mjs";

test("trial starts only when a successful authenticated session exists", () => {
  assert.equal(shouldStartTrial({ authenticated: false, trialStartedAt: null }), false);
  assert.equal(shouldStartTrial({ authenticated: true, trialStartedAt: "2026-09-01T00:00:00Z" }), false);
  assert.equal(shouldStartTrial({ authenticated: true, trialStartedAt: null }), true);
});
