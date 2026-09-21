import test from "node:test";
import assert from "node:assert/strict";
import { buildFullMusicVideoRequest } from "../src/lib/media/track-package.ts";

test("track package passes the finished song to the full music-video pipeline", () => {
  const request = buildFullMusicVideoRequest({
    audio: "finished-song",
    audioDurationSeconds: 187,
    title: "Test Song",
    direction: "cinematic and nocturnal",
    referenceImage: "cover-art",
  });

  assert.equal(request.audio, "finished-song");
  assert.equal(request.audioDurationSeconds, 187);
  assert.equal(request.title, "Test Song");
  assert.equal(request.direction, "cinematic and nocturnal");
  assert.equal(request.referenceImage, "cover-art");
});

test("track package does not silently turn a full song into a short video duration", () => {
  const request = buildFullMusicVideoRequest({
    audio: "finished-song",
    audioDurationSeconds: 187,
  });

  assert.equal(request.audioDurationSeconds, 187);
  assert.equal("duration" in request, false);
});
