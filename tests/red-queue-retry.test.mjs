import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), "../src/lib/voice-clone-gateway.ts"), "utf8");

test("Red gateway uses the official Qwen3-TTS reference-clone API", () => {
  assert.match(source, /Qwen3-TTS reference clone/);
  assert.match(source, /https:\/\/qwen-qwen3-tts\.hf\.space/);
  assert.match(source, /generate_voice_clone/);
  assert.match(source, /QWEN_QUEUE_RETRY_DELAYS_MS = \[1500, 4000, 8000\]/);
  assert.match(source, /useXVectorOnly|!refText/);
  assert.doesNotMatch(source, /openbmb-voxcpm-demo\.hf\.space/);
});

test("Qwen SSE parser accepts completed audio artifacts", () => {
  assert.match(source, /parseQwenTTSSSE/);
  assert.match(source, /event === "complete"/);
  assert.match(source, /x-red-voice-route.*qwen3-tts-reference-clone/);
});
