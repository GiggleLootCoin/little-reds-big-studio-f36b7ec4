import test from "node:test";
import assert from "node:assert/strict";
import { inspectMusicVideoAvStreams } from "../src/lib/media/music-video-pipeline.ts";

test("reports synchronized audio and video streams from decoded media metadata", () => {
  assert.deepEqual(
    inspectMusicVideoAvStreams({
      contentType: "video/mp4",
      videoDurationSeconds: 20,
      audioDurationSeconds: 20,
      hasVideoStream: true,
      hasAudioStream: true,
    }),
    { hasVideoStream: true, hasAudioStream: true, videoDurationSeconds: 20, audioDurationSeconds: 20 },
  );
});

test("fails closed when the decoded artifact has no audio stream", () => {
  assert.deepEqual(
    inspectMusicVideoAvStreams({
      contentType: "video/mp4",
      videoDurationSeconds: 20,
      audioDurationSeconds: 0,
      hasVideoStream: true,
      hasAudioStream: false,
    }),
    { hasVideoStream: true, hasAudioStream: false, videoDurationSeconds: 20, audioDurationSeconds: 0 },
  );
});
