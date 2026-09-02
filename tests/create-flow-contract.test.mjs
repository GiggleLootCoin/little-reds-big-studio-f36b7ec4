import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("create UI points the standalone video panel at a real configured runner", async () => {
  const source = await readFile("src/components/studio/sections-create.tsx", "utf8");
  assert.match(source, /runner\("hf-wan22-fast-preview"\)/);
  assert.doesNotMatch(source, /runner\("hf-wan-s2v"\)/);
});

test("track package keeps the generated music as the source artifact", async () => {
  const source = await readFile("src/components/studio/FreeCreatePanel.tsx", "utf8");
  assert.match(source, /const music = await runStudioJob\(\s*"music"/);
  assert.match(source, /const artwork = await runStudioJob\(\s*"image"/);
  assert.match(source, /const video = await runStudioJob\(\s*"video"/);
  assert.match(source, /setArtifact\(music\)/);
});
