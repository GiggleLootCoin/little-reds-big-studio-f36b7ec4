import test from "node:test";
import assert from "node:assert/strict";
import { inspectMusicVideoAvStreams } from "../src/lib/media/music-video-pipeline.ts";

test("reports synchronized audio and video streams from decoded media metadata", () => {
  assert.deepEqual(
    inspectMusicVideoAvStreams({
      hasVideoStream: true,
      hasAudioStream: true,
      videoDurationSeconds: 20,
      audioDurationSeconds: 20,
    }),
    {
      hasVideoStream: true,
      hasAudioStream: true,
      videoDurationSeconds: 20,
      audioDurationSeconds: 20,
    },
  );
});

test("normalizes non-finite decoded durations to zero", () => {
  assert.deepEqual(
    inspectMusicVideoAvStreams({
      hasVideoStream: true,
      hasAudioStream: false,
      videoDurationSeconds: Number.NaN,
      audioDurationSeconds: Number.POSITIVE_INFINITY,
    }),
    {
      hasVideoStream: true,
      hasAudioStream: false,
      videoDurationSeconds: 0,
      audioDurationSeconds: 0,
    },
  );
});
