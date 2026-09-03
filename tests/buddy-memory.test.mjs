import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBuddyMemories,
  buildBuddyMemoryContext,
  rememberUserMessage,
} from "../src/lib/buddy-memory.mjs";

test("extracts explicit preferences and remembered facts", () => {
  assert.deepEqual(extractBuddyMemories("My favorite color is red."), [
    "Favorite color: red",
  ]);
  assert.deepEqual(extractBuddyMemories("Remember that I prefer concise replies."), [
    "I prefer concise replies",
  ]);
});

test("persists memories in localStorage and exposes them as model context", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    },
  };
  rememberUserMessage("Call me Red.");
  rememberUserMessage("I like making music.");
  const context = buildBuddyMemoryContext();
  assert.match(context, /Call me Red/i);
  assert.match(context, /I like making music/i);
  delete globalThis.window;
});
