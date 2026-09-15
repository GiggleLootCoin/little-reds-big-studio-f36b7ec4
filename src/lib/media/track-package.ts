export type FullMusicVideoRequest = {
  audio: Blob | File | string;
  audioDurationSeconds: number;
  title?: string;
  direction?: string;
  storyboard?: string;
  referenceImage?: Blob | File | string | null;
};

export function buildFullMusicVideoRequest(input: FullMusicVideoRequest): FullMusicVideoRequest {
  if (!input.audio) throw new Error("A finished song is required before creating a music video.");
  if (!Number.isFinite(input.audioDurationSeconds) || input.audioDurationSeconds <= 0)
    throw new Error("A positive finished-song duration is required before creating a music video.");

  return {
    audio: input.audio,
    audioDurationSeconds: input.audioDurationSeconds,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.direction?.trim() ? { direction: input.direction.trim() } : {}),
    ...(input.storyboard?.trim() ? { storyboard: input.storyboard.trim() } : {}),
    ...(input.referenceImage ? { referenceImage: input.referenceImage } : {}),
  };
}
