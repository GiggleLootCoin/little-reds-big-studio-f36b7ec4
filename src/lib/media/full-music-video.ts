import { Client, handle_file } from "@gradio/client";
import { buildMusicVideoPlan, type MusicVideoChunk } from "./music-video-pipeline";

const PRIMARY_VIDEO_SPACE = "MiniMaxAI/MiniMax-H3-Turbo-Lora";
const FALLBACK_VIDEO_SPACE = "zerogpu-aoti/Wan2.2-14B-Fast";
const VIDEO_ENDPOINT = "/generate";
const VIDEO_CANVAS = "960x544 · 16:9 fast";
const VIDEO_STEPS = 4;

type Progress = (update: {
  phase: "planning" | "generating" | "rendering" | "complete";
  completed: number;
  total: number;
  message: string;
}) => void;

export type FullMusicVideoOptions = {
  audioBlob: Blob;
  audioDurationSeconds: number;
  title?: string;
  direction?: string;
  storyboard?: string;
  referenceImageBlob?: Blob | null;
  onProgress?: Progress;
};

export type FullMusicVideoResult = {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  chunkCount: number;
  engine: string;
};

function progress(onProgress: Progress | undefined, update: Parameters<Progress>[0]) {
  onProgress?.(update);
}

function resultUrl(value: unknown): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["url", "path", "video", "output", "result"]) {
      const found = resultUrl((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return null;
}

async function outputBlob(value: unknown): Promise<Blob> {
  const url = resultUrl(value);
  if (!url) throw new Error("The video engine returned no playable video artifact.");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The generated video could not be downloaded (${response.status}).`);
  const blob = await response.blob();
  if (!blob.type.startsWith("video/") || blob.size < 100_000)
    throw new Error("The video engine returned an invalid or empty video artifact.");
  return blob;
}

function scenePrompt(options: FullMusicVideoOptions, chunk: MusicVideoChunk): string {
  const base =
    options.direction?.trim() ||
    options.storyboard?.trim() ||
    "cinematic music video with strong visual storytelling and polished professional cinematography";
  const title = options.title?.trim() ? ` for the song \"${options.title.trim()}\"` : "";
  return [
    `Create scene ${chunk.index + 1}${title}.`,
    base,
    `This scene covers ${chunk.startSeconds.toFixed(1)}s to ${chunk.endSeconds.toFixed(1)}s of the song.`,
    "Maintain the same subject identity, wardrobe, environment, color language, camera language and visual story across the complete music video.",
    "Use purposeful camera motion, natural motion, cinematic lighting and a visually interesting composition.",
    "Do not add captions, logos, watermarks, UI, fake song titles or readable text.",
  ].join(" ");
}

async function generateChunk(
  space: string,
  chunk: MusicVideoChunk,
  prompt: string,
  imageBlob: Blob | null,
): Promise<Blob> {
  const client = await Client.connect(space);
  const image = imageBlob ? handle_file(imageBlob) : null;
  const response = await client.predict(VIDEO_ENDPOINT, [
    prompt,
    image,
    null,
    VIDEO_CANVAS,
    chunk.durationSeconds,
    VIDEO_STEPS,
    1000 + chunk.index,
    false,
  ]);
  const data = response.data as unknown[];
  return outputBlob(data?.[0]);
}

function chooseMimeType(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "video/webm";
}

function waitForEvent(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onResolve = () => {
      target.removeEventListener(event, onResolve);
      target.removeEventListener("error", onReject);
      resolve();
    };
    const onReject = () => {
      target.removeEventListener(event, onResolve);
      target.removeEventListener("error", onReject);
      reject(new Error("The browser could not decode a generated video scene."));
    };
    target.addEventListener(event, onResolve, { once: true });
    target.addEventListener("error", onReject, { once: true });
  });
}

async function renderFullVideo(
  chunks: Array<{ chunk: MusicVideoChunk; blob: Blob }>,
  audioBlob: Blob,
  durationSeconds: number,
  onProgress?: Progress,
): Promise<{ blob: Blob; mimeType: string }> {
  if (!HTMLCanvasElement.prototype.captureStream || typeof MediaRecorder === "undefined")
    throw new Error("This Android browser does not support in-browser music-video rendering.");

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create the video renderer.");

  const AudioContextCtor = window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("This browser does not support audio rendering.");

  const audioContext = new AudioContextCtor();
  const audioData = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));
  const audioDestination = audioContext.createMediaStreamDestination();
  const audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioDestination);

  const stream = canvas.captureStream(30);
  for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);

  const mimeType = chooseMimeType();
  const recorder = new MediaRecorder(stream, { mimeType });
  const recorded: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) recorded.push(event.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("The browser stopped recording the music video unexpectedly."));
  });

  recorder.start(1000);
  await audioContext.resume();
  audioSource.start(0);

  let elapsed = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const { chunk, blob } = chunks[index];
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const url = URL.createObjectURL(blob);
    video.src = url;
    await waitForEvent(video, "loadedmetadata");
    video.currentTime = 0;
    video.playbackRate = Math.max(0.5, Math.min(2, video.duration / Math.max(0.01, chunk.durationSeconds)));
    await video.play();

    const startedAt = performance.now();
    const renderFrame = () => {
      const local = Math.min(chunk.durationSeconds, (performance.now() - startedAt) / 1000);
      const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      if (local < chunk.durationSeconds) requestAnimationFrame(renderFrame);
    };
    renderFrame();
    await new Promise<void>((resolve) => window.setTimeout(resolve, chunk.durationSeconds * 1000));
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    elapsed += chunk.durationSeconds;
    progress(onProgress, {
      phase: "rendering",
      completed: index + 1,
      total: chunks.length,
      message: `Assembling scene ${index + 1} of ${chunks.length} (${Math.round(elapsed)}s / ${Math.round(durationSeconds)}s).`,
    });
  }

  await new Promise((resolve) => window.setTimeout(resolve, 250));
  recorder.stop();
  audioSource.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();

  const blob = new Blob(recorded, { type: mimeType });
  if (blob.size < 100_000) throw new Error("The rendered music video was empty.");
  return { blob, mimeType };
}

export async function generateFullMusicVideo(
  options: FullMusicVideoOptions,
): Promise<FullMusicVideoResult> {
  if (!options.audioBlob.size) throw new Error("A generated song is required before creating a music video.");
  const plan = buildMusicVideoPlan({ durationSeconds: options.audioDurationSeconds, sceneSeconds: 14 });
  progress(options.onProgress, {
    phase: "planning",
    completed: 0,
    total: plan.chunks.length,
    message: `Planned ${plan.chunks.length} cinematic scenes for a ${Math.round(plan.totalDurationSeconds)} second song.`,
  });

  const engines = [PRIMARY_VIDEO_SPACE, FALLBACK_VIDEO_SPACE];
  let lastError: unknown = null;
  for (const engine of engines) {
    const generated: Array<{ chunk: MusicVideoChunk; blob: Blob }> = [];
    try {
      for (const chunk of plan.chunks) {
        progress(options.onProgress, {
          phase: "generating",
          completed: chunk.index,
          total: plan.chunks.length,
          message: `Generating scene ${chunk.index + 1} of ${plan.chunks.length} with ${engine}.`,
        });
        const blob = await generateChunk(
          engine,
          chunk,
          scenePrompt(options, chunk),
          options.referenceImageBlob ?? null,
        );
        generated.push({ chunk, blob });
      }

      progress(options.onProgress, {
        phase: "rendering",
        completed: 0,
        total: plan.chunks.length,
        message: "Rendering the generated scenes against the exact finished song audio.",
      });
      const rendered = await renderFullVideo(
        generated,
        options.audioBlob,
        plan.totalDurationSeconds,
        options.onProgress,
      );
      progress(options.onProgress, {
        phase: "complete",
        completed: plan.chunks.length,
        total: plan.chunks.length,
        message: "Full music video rendered successfully.",
      });
      return {
        blob: rendered.blob,
        mimeType: rendered.mimeType,
        durationSeconds: plan.totalDurationSeconds,
        chunkCount: generated.length,
        engine,
      };
    } catch (error) {
      lastError = error;
      if (engine !== engines.at(-1)) continue;
    }
  }

  throw new Error(
    `All verified free video engines failed. ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
