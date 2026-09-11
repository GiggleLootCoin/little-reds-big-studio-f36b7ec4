import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLocalQwenUrl, extractLocalQwenText, isLocalQwenEnabled } from "../src/lib/local-qwen.ts";

test("normalizes a local Qwen base URL to the OpenAI-compatible chat endpoint", () => {
  assert.equal(
    normalizeLocalQwenUrl("http://127.0.0.1:8080"),
    "http://127.0.0.1:8080/v1/chat/completions",
  );
  assert.equal(
    normalizeLocalQwenUrl("http://127.0.0.1:8080/v1/"),
    "http://127.0.0.1:8080/v1/chat/completions",
  );
});

test("extracts a non-empty assistant message from an OpenAI-compatible response", () => {
  assert.equal(
    extractLocalQwenText({
      choices: [{ message: { role: "assistant", content: "Hello from local Qwen." } }],
    }),
    "Hello from local Qwen.",
  );
});

test("does not enable local Qwen unless an endpoint is explicitly configured", () => {
  const previous = process.env.BUDDY_LOCAL_QWEN_URL;
  delete process.env.BUDDY_LOCAL_QWEN_URL;
  assert.equal(isLocalQwenEnabled(), false);
  if (previous !== undefined) process.env.BUDDY_LOCAL_QWEN_URL = previous;
});
