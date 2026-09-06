import assert from "node:assert/strict";
import { test } from "node:test";

const source = await (await fetch(new URL("../src/lib/voice-clone-gateway.ts", import.meta.url))).text();

test("Red gateway retries queue-full responses without refreshing the reference", () => {
  assert.match(source, /VOXCPM_QUEUE_RETRY_DELAYS_MS = \[1500, 4000, 8000\]/);
  assert.match(source, /isQueueFullError/);
  assert.match(source, /generateWithQueueRetry/);
  assert.doesNotMatch(source, /generateFromSpace\(space, body, env, true\)/);
});
