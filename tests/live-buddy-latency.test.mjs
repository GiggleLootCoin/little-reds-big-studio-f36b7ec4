import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const clone = await readFile("src/lib/real-voice-clone-v2.ts", "utf8");
const gateway = await readFile("src/lib/voice-clone-gateway.ts", "utf8");
const runtime = await readFile("src/lib/studio-runtime.ts", "utf8");
const chat = await readFile("src/components/studio/BuddyLiveChat.tsx", "utf8");

test("live Buddy speech uses the fast 0.6B path while explicit cloning keeps the 1.7B quality path", () => {
  assert.match(chat, /model_size:\s*(?:"0\.6B"|liveRef\.current\s*\?\s*"0\.6B"\s*:\s*"1\.7B")/);
  assert.match(clone, /modelSize:\s*"0\.6B" \| "1\.7B"/);
  assert.match(gateway, /modelSize\?:\s*"0\.6B" \| "1\.7B"/);
});

test("live speech is bounded and does not wait for IndexedDB persistence before playback", () => {
  assert.match(clone, /slice\(0, 220\)/);
  assert.match(runtime, /runVerifiedClone\(\s*savedSample[\s\S]*?modelSize,\s*false(?:\s*,\s*[^)]*)?\)/);
});

test("Buddy sends a bounded recent conversation window to reduce prompt prefill latency", () => {
  assert.match(chat, /messages\.slice\(-12\)\.map/);
});
