import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), "../src/lib/voice-clone-gateway.ts"), "utf8");

test("Red gateway retries queue-full responses without refreshing the reference", () => {
  assert.match(source, /VOXCPM_QUEUE_RETRY_DELAYS_MS = \[1500, 4000, 8000\]/);
  assert.match(source, /isQueueFullError/);
  assert.match(source, /generateWithQueueRetry/);
  assert.doesNotMatch(source, /generateFromSpace\(space, body, env, true\)/);
});
