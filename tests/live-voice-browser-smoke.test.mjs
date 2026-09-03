import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const smoke = await readFile("scripts/live-voice-browser-smoke.mjs", "utf8");

test("production Android voice smoke uses the current Qwen gateway and real Red reference", () => {
  assert.match(smoke, /\/api\/ai\/speech-to-text/);
  assert.match(smoke, /\/api\/ai\/voice-clone/);
  assert.match(smoke, /referenceId/);
  assert.match(smoke, /audioBase64/);
  assert.match(smoke, /refText/);
  assert.match(smoke, /AudioContext/);
  assert.match(smoke, /isMobile:\s*true/);
  assert.doesNotMatch(smoke, /\/api\/voice-clone/);
});
