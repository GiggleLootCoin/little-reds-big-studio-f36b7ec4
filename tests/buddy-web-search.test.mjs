import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile("src/server.ts", "utf8");
const runners = await readFile("src/lib/free-runners.ts", "utf8");

test("Buddy has a server-side live web search endpoint", () => {
  assert.match(server, /\/api\/ai\/web-search/);
  assert.match(server, /duckduckgo/i);
  assert.match(server, /webSearch/);
});

test("web search is exposed as a Buddy runtime capability", () => {
  assert.match(runners, /web-search/);
});
