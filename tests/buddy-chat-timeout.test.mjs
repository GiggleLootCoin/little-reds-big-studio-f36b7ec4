import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile("src/server.ts", "utf8");
const runtime = await readFile("src/lib/studio-runtime-impl.ts", "utf8");

test("Buddy chat external fallbacks have one abortable timeout per request", () => {
  assert.match(server, /const controller = new AbortController\(\)/);
  assert.match(server, /signal: controller\.signal/);
  assert.match(server, /finally \{\s*clearTimeout\(timer\)/);
});

test("Buddy chat stays on the bounded server fallback chain and exits its loading state", () => {
  assert.match(runtime, /prepared\.capability !== "chat" \|\| provider\.url\.startsWith\("\/api\/ai\/chat"\)/);
  assert.match(runtime, /prepared\.capability === "chat"\s*\? 18000/);
});
