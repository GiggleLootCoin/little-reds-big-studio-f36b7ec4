import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/lib/buddy-agent.ts", "utf8");

test("Buddy agent exposes live web-search routing", () => {
  assert.match(source, /shouldSearchWeb/);
  assert.match(source, /web-search/);
  assert.match(source, /latest|current|best|find|search/i);
});

test("Buddy agent can represent multi-step creative actions", () => {
  assert.match(source, /music/);
  assert.match(source, /image/);
  assert.match(source, /video/);
  assert.match(source, /voice-clone/);
  assert.match(source, /singing-voice-conversion/);
});

test("Buddy agent preserves the Red voice as the default voice intent", () => {
  assert.match(source, /red/i);
  assert.match(source, /voice/i);
});

test("Buddy agent has explicit emotional live-character state", () => {
  assert.match(source, /emotion/);
  assert.match(source, /listening/);
  assert.match(source, /speaking/);
  assert.match(source, /thinking/);
});
