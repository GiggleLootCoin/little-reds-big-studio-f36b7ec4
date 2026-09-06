export type MusicVideoChunk = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

export type MusicVideoPlan = {
  totalDurationSeconds: number;
  chunks: MusicVideoChunk[];
};

const MIN_GENERATION_SECONDS = 2;
const MAX_GENERATION_SECONDS = 14;
const DEFAULT_SCENE_SECONDS = 10;

export function chooseMusicVideoChunkSeconds(requestedSeconds: number): number {
  if (!Number.isFinite(requestedSeconds)) return DEFAULT_SCENE_SECONDS;
  return Math.min(
    MAX_GENERATION_SECONDS,
    Math.max(MIN_GENERATION_SECONDS, Math.round(requestedSeconds)),
  );
}

export function buildMusicVideoPlan({
  durationSeconds,
  sceneSeconds = DEFAULT_SCENE_SECONDS,
}: {
  durationSeconds: number;
  sceneSeconds?: number;
}): MusicVideoPlan {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("A positive song duration is required.");

  const totalDurationSeconds = Number(durationSeconds.toFixed(3));
  const preferredChunk = chooseMusicVideoChunkSeconds(sceneSeconds);
  const chunks: MusicVideoChunk[] = [];
  let startSeconds = 0;
  let index = 0;

  while (startSeconds < totalDurationSeconds) {
    const remaining = totalDurationSeconds - startSeconds;
    const duration =
      remaining <= MAX_GENERATION_SECONDS
        ? remaining
        : Math.min(preferredChunk, remaining);
    const normalizedDuration = Number(duration.toFixed(3));
    chunks.push({
      index,
      startSeconds: Number(startSeconds.toFixed(3)),
      endSeconds: Number((startSeconds + normalizedDuration).toFixed(3)),
      durationSeconds: normalizedDuration,
    });
    startSeconds += normalizedDuration;
    index += 1;
  }

  return { totalDurationSeconds, chunks };
}

export function validateMusicVideoArtifact(input: {
  contentType: string;
  videoDurationSeconds: number;
  audioDurationSeconds: number;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  byteLength: number;
  expectedDurationSeconds: number;
}): boolean {
  if (!/^video\/mp4(?:;|$)/i.test(input.contentType)) return false;
  if (!input.hasVideoStream || !input.hasAudioStream) return false;
  if (!Number.isFinite(input.videoDurationSeconds) || input.videoDurationSeconds <= 0) return false;
  if (!Number.isFinite(input.audioDurationSeconds) || input.audioDurationSeconds <= 0) return false;
  if (!Number.isFinite(input.expectedDurationSeconds) || input.expectedDurationSeconds <= 0) return false;
  if (!Number.isFinite(input.byteLength) || input.byteLength < 100_000) return false;

  const videoDelta = Math.abs(input.videoDurationSeconds - input.expectedDurationSeconds);
  const audioDelta = Math.abs(input.audioDurationSeconds - input.expectedDurationSeconds);
  const avDelta = Math.abs(input.videoDurationSeconds - input.audioDurationSeconds);
  const tolerance = Math.max(0.25, input.expectedDurationSeconds * 0.01);

  return videoDelta <= tolerance && audioDelta <= tolerance && avDelta <= 0.25;
}

export const MUSIC_VIDEO_LIMITS = {
  minGenerationSeconds: MIN_GENERATION_SECONDS,
  maxGenerationSeconds: MAX_GENERATION_SECONDS,
};
