import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile("src/lib/studio-runtime.ts", "utf8");

test("Buddy Red default voice excludes every generic Chatterbox fallback", () => {
  assert.match(
    runtime,
    /_skipProviders:\s*\["hf-qwen3-tts",\s*"hf-chatterbox",\s*"hf-chatterbox-v3"\]/,
  );
  assert.match(runtime, /cloneProfile\(\)\.speaker === "Red" && !refText\.trim\(\)/);
});
