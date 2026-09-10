import test from "node:test";
import assert from "node:assert/strict";
import { validateMusicVideoArtifact } from "../src/lib/media/music-video-pipeline.ts";

test("accepts a finished MP4 only when both synchronized audio and video streams are proven", () => {
  assert.equal(
    validateMusicVideoArtifact({
      contentType: "video/mp4",
      videoDurationSeconds: 20,
      audioDurationSeconds: 20,
      hasVideoStream: true,
      hasAudioStream: true,
      byteLength: 500_000,
      expectedDurationSeconds: 20,
    }),
    true,
  );
});

test("rejects a video-only artifact even when its duration and size look valid", () => {
  assert.equal(
    validateMusicVideoArtifact({
      contentType: "video/mp4",
      videoDurationSeconds: 20,
      audioDurationSeconds: 20,
      hasVideoStream: true,
      hasAudioStream: false,
      byteLength: 500_000,
      expectedDurationSeconds: 20,
    }),
    false,
  );
});
