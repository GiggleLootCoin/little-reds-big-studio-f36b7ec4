import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const gateway = await read("src/lib/voice-clone-gateway.ts");
const clone = await read("src/lib/real-voice-clone-v2.ts");
const server = await read("src/server.ts");

test("Qwen gateway uses the bounded full-reference Base clone contract", () => {
  assert.match(gateway, /generate_voice_clone/);
  assert.match(gateway, /requested/);
  assert.match(gateway, /requested,\s*\n?\s*env/);
  assert.match(gateway, /\"1\.7B\"/);
  assert.match(gateway, /\"0\.6B\"/);
  assert.doesNotMatch(gateway, /headers\.(?:set|append)\([\"']x-clone-verified[\"']/);
});

test("production clone generation uses Qwen and validates its exact returned Blob", () => {
  assert.match(clone, /\/api\/voice-clone/);
  assert.match(clone, /normalizeAndVerifyBrowserAudio/);
  assert.match(clone, /response\.blob\(\)/);
  assert.match(clone, /referenceId/);
  assert.match(clone, /status === 428/);
  assert.match(gateway, /referenceCache/);
  assert.match(gateway, /REFERENCE_CACHE_TTL_MS/);
  assert.doesNotMatch(clone, /createLocalChatterboxClone/);
});

test("the live voice path limits conversational speech length to keep replies responsive", () => {
  assert.match(clone, /slice\(0, 220\)/);
});

test("the server exposes the Qwen clone gateway without exposing the HF token", () => {
  assert.match(server, /handleVoiceClone/);
  assert.match(server, /\/api\/voice-clone/);
  assert.doesNotMatch(server, /HF_TOKEN.*window/);
});
