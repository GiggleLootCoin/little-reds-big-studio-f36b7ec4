import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const gateway = await read("src/lib/voice-clone-gateway.ts");
const clone = await read("src/lib/real-voice-clone-v2.ts");
const server = await read("src/server.ts");

test("VoxCPM2 gateway uses the verified full-reference clone contract", () => {
  assert.match(gateway, /openbmb-voxcpm-demo\.hf\.space/);
  assert.match(gateway, /gradio_api\/upload/);
  assert.match(gateway, /gradio_api\/call\/generate/);
  assert.match(gateway, /REFERENCE_CACHE_TTL_MS/);
  assert.match(gateway, /x-clone-provider/);
  assert.match(gateway, /x-red-voice-route/);
  assert.doesNotMatch(gateway, /generate_voice_clone/);
  assert.doesNotMatch(gateway, /QWEN_TTS/);
});

test("production clone generation uses VoxCPM2 and validates its exact returned audio", () => {
  assert.match(clone, /\/api\/voice-clone/);
  assert.match(clone, /normalizeAndVerifyBrowserAudio/);
  assert.match(clone, /response\.blob\(\)/);
  assert.match(clone, /referenceId/);
  assert.match(clone, /status === 428/);
  assert.doesNotMatch(clone, /createLocalChatterboxClone/);
});

test("the live voice path limits conversational speech length to keep replies responsive", () => {
  assert.match(clone, /slice\(0, 220\)/);
});

test("the server only delegates the canonical clone request and does not expose the HF token", () => {
  assert.match(server, /handleVoiceClone/);
  assert.match(server, /\/api\/ai\/voice-clone/);
  assert.doesNotMatch(server, /HF_TOKEN.*window/);
});
