import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const orchestrator = await read("src/lib/buddy-orchestrator.ts");
const runners = await read("src/lib/free-runners.ts");

test("Buddy maps writing to the chat capability and voice to TTS", () => {
  assert.match(orchestrator, /writing:\s*"chat"/);
  assert.match(orchestrator, /voice:\s*"tts"/);
});

test("the free route registry exposes actual candidates for writing and TTS", () => {
  assert.match(runners, /capabilities:\s*\["chat"/);
  assert.match(runners, /capabilities:\s*\["tts"\]/);
});

test("Buddy never falls back from the free-only router to an undeclared paid provider", () => {
  assert.doesNotMatch(orchestrator, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|OPENROUTER/);
});
