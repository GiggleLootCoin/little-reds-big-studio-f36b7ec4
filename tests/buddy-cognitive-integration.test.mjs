import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const memory = await readFile("src/lib/buddy-memory.mjs", "utf8");
const chat = await readFile("src/components/studio/BuddyLiveChat.tsx", "utf8");

test("Buddy's runtime memory context imports the canonical cognitive system prompt", () => {
  assert.match(memory, /buddy-agent/);
  assert.match(memory, /buildAgentSystemPrompt/);
  assert.match(memory, /const cognitiveContext = buildAgentSystemPrompt\(\)/);
});

test("Buddy chat still sends an explicit system message before user content", () => {
  assert.match(chat, /role: "system"/);
  assert.match(chat, /messages: history/);
});
