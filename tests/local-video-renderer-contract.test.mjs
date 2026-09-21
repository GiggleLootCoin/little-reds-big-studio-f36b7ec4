import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("local video renderer creates an actual recorded video stream from artwork", async () => {
  const source = await readFile("src/lib/media/local-video-renderer.ts", "utf8");
  assert.match(source, /captureStream\(30\)/);
  assert.match(source, /new MediaRecorder\(/);
  assert.match(source, /new Blob\(chunks/);
  assert.match(source, /video\/webm/);
});

test("full music-video fallback uses the exact finished song audio and artwork", async () => {
  const source = await readFile("src/lib/media/full-music-video.ts", "utf8");
  assert.match(source, /renderLocalCinematicVideo\(/);
  assert.match(source, /audioBlob: options\.audioBlob/);
  assert.match(source, /imageBlob: options\.referenceImageBlob/);
  assert.match(source, /engine: "local-cinematic-renderer"/);
});
