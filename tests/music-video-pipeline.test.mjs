import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMusicVideoPlan,
  chooseMusicVideoChunkSeconds,
  validateMusicVideoArtifact,
} from "../src/lib/media/music-video-pipeline.ts";

test("music video planner covers the complete song with bounded generation chunks", () => {
  const plan = buildMusicVideoPlan({ durationSeconds: 187, sceneSeconds: 12 });

  assert.equal(plan.totalDurationSeconds, 187);
  assert.equal(plan.chunks.at(-1)?.endSeconds, 187);
  assert.ok(plan.chunks.length >= 15);
  assert.ok(plan.chunks.every((chunk) => chunk.durationSeconds >= 2));
  assert.ok(plan.chunks.every((chunk) => chunk.durationSeconds <= 14));
});

test("music video chunk sizing stays inside the verified H3 Turbo window", () => {
  assert.equal(chooseMusicVideoChunkSeconds(1), 2);
  assert.equal(chooseMusicVideoChunkSeconds(8), 8);
  assert.equal(chooseMusicVideoChunkSeconds(20), 14);
});

test("final music video validation requires playable video, audio, and matching duration", () => {
  assert.equal(
    validateMusicVideoArtifact({
      contentType: "video/mp4",
      videoDurationSeconds: 187.04,
      audioDurationSeconds: 187,
      hasVideoStream: true,
      hasAudioStream: true,
      byteLength: 12_000_000,
      expectedDurationSeconds: 187,
    }),
    true,
  );

  assert.equal(
    validateMusicVideoArtifact({
      contentType: "video/mp4",
      videoDurationSeconds: 14,
      audioDurationSeconds: 14,
      hasVideoStream: true,
      hasAudioStream: true,
      byteLength: 500_000,
      expectedDurationSeconds: 187,
    }),
    false,
  );
});
