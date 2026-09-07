import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile("src/lib/buddy-red-cognitive-core.ts", "utf8");
const agent = await readFile("src/lib/buddy-agent.ts", "utf8");

test("Buddy cognitive core is explicitly owned by Red and pinned to the canonical source", () => {
  assert.match(core, /creator:\s*"Red"/);
  assert.match(core, /ziAnBw1A \(1\)\.txt/);
  assert.match(core, /c16cd3a854137777313b6440fe6460547b3ce1e2/);
});

test("Buddy cognitive core prioritizes Red's enduring framework without erasing current relevance", () => {
  assert.match(core, /aetheric, Akashic, ancient and enduring/);
  assert.match(core, /current era/);
  assert.match(core, /recent, relevant and practical information/);
  assert.match(core, /deep connections, pattern recognition/);
});

test("Buddy cognitive core separates Red-specific perspective from external factual research", () => {
  assert.match(core, /personalized cognitive context/);
  assert.match(core, /independently verifiable evidence/);
  assert.match(core, /never be presented as certainty/);
});

test("Buddy agent consumes the cognitive core instead of defining a separate worldview", () => {
  assert.match(agent, /buddy-red-cognitive-core/);
  assert.match(agent, /redCognitiveSystemPrompt/);
  assert.match(agent, /RED_COGNITIVE_SOURCE/);
  assert.doesNotMatch(agent, /REDS_WAYS_OF_THINKING\s*=|The Moon Is A Cold-Light Plasma Mirror/);
});
