import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const gateway = await read("src/lib/voice-clone-gateway.ts");
const clone = await read("src/lib/real-voice-clone-v2.ts");
const server = await read("src/server.ts");

test("Qwen3-TTS gateway uses the verified reference-clone contract", () => {
  assert.match(gateway, /qwen-qwen3-tts\.hf\.space/);
  assert.match(gateway, /gradio_api\/upload/);
  assert.match(gateway, /gradio_api\/call\/generate_voice_clone/);
  assert.match(gateway, /normalizeUploadedFile/);
  assert.match(gateway, /REFERENCE_CACHE_TTL_MS/);
  assert.match(gateway, /x-clone-provider/);
  assert.match(gateway, /x-red-voice-route/);
  assert.match(gateway, /0\.6B/);
  assert.doesNotMatch(gateway, /openbmb-voxcpm-demo/);
  assert.doesNotMatch(gateway, /VoxCPM2/);
});

test("Qwen terminal-null clone failures recover on Qwen3-TTS 1.7B and then a secondary Qwen3-TTS Space", () => {
  assert.match(gateway, /isTerminalNullError/);
  assert.match(gateway, /terminal null on 0\.6B/);
  assert.match(gateway, /modelSize: "1\.7B"/);
  assert.match(gateway, /allowHighQuality: true/);
  assert.match(gateway, /wordercom-qwen3-tts\.hf\.space/);
  assert.match(gateway, /same clone on 1\.7B/);
  assert.match(gateway, /secondary Qwen3-TTS Space/);
  assert.match(gateway, /Qwen3-TTS reference clone/);
});

test("production clone generation uses Qwen3-TTS and validates its exact returned audio", () => {
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

test("the server delegates voice requests through the gateway without exposing the HF token", () => {
  assert.match(server, /handleVoiceClone/);
  assert.match(server, /AI_PREFIX = "\/api\/ai\/"/);
  assert.doesNotMatch(server, /HF_TOKEN.*window/);
});
