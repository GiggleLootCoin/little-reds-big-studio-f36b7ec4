import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("standalone video panel resolves its configured Wan runner", async () => {
  const source = await readFile("src/components/studio/sections-create.tsx", "utf8");
  const runners = await readFile("src/lib/free-runners.ts", "utf8");
  const match = source.match(/runner\("([^"]+)"\)/);
  assert.ok(match?.[1], "Video panel must name a runner");
  assert.match(runners, new RegExp(`id: "${match[1]}"`));
});

test("track package keeps the generated music as the source artifact", async () => {
  const source = await readFile("src/components/studio/FreeCreatePanel.tsx", "utf8");
  assert.match(source, /const music = await runStudioJob\(\s*"music"/);
  assert.match(source, /const artwork = await runStudioJob\(\s*"image"/);
  assert.match(source, /const video = await runStudioJob\(\s*"video"/);
  assert.match(source, /setArtifact\(music\)/);
});
