import { Client, handle_file } from "@gradio/client";

export type RealCloneResult = { url: string; provider: string; voiceId?: string };

const QWEN_SPACE = "Qwen/Qwen3-TTS";
const QWEN_CLONE_ENDPOINT = "/generate_voice_clone";
const CPU_SPACE = "chienweichang/qwen3-tts-voice-clone-cpu";
const CPU_PROXY = `/api/hf-space/${encodeURIComponent(CPU_SPACE)}`;
const DEFAULT_CLONE_TEXT =
  "Hi. I'm Buddy. This is a voice-clone test. The voice you supplied is speaking these words.";
const QWEN_LANGUAGES = new Set([
  "Auto",
  "Chinese",
  "English",
  "Japanese",
  "Korean",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Russian",
]);

function cloneLanguage(value: string): string {
  const normalized = value.trim();
  return QWEN_LANGUAGES.has(normalized) ? normalized : "Auto";
}

function numericSamples(value: unknown): number[] | null {
  if (value instanceof Float32Array || value instanceof Float64Array || value instanceof Int16Array)
    return Array.from(value, Number);
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((x) => typeof x === "number" && Number.isFinite(x))
  )
    return value as number[];
  return null;
}

function samplesToWav(sampleRate: number, samples: number[]): Blob {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const n = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.byteLength),
    view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate * 2), true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
  return new Blob([buffer], { type: "audio/wav" });
}

async function outputToBlob(output: unknown): Promise<Blob> {
  if (output instanceof Blob) return output;
  if (Array.isArray(output) && output.length >= 2 && typeof output[0] === "number") {
    const samples = numericSamples(output[1]);
    if (samples) return samplesToWav(output[0], samples);
  }
  if (typeof output === "string" && /^(https?:|blob:|data:)/i.test(output)) {
    const response = await fetch(output);
    if (!response.ok)
      throw new Error(`The clone audio could not be downloaded (${response.status}).`);
    return response.blob();
  }
  if (output && typeof output === "object") {
    const file = output as Record<string, unknown>;
    if (file.data && file.data !== output) {
      try {
        return await outputToBlob(file.data);
      } catch {
        /* continue */
      }
    }
    for (const key of ["url", "path"]) {
      const value = file[key];
      if (typeof value === "string" && /^(https?:|blob:|data:)/i.test(value)) {
        const response = await fetch(value);
        if (!response.ok)
          throw new Error(`The clone audio could not be downloaded (${response.status}).`);
        return response.blob();
      }
    }
  }
  throw new Error("Qwen returned no downloadable clone audio artifact.");
}

function validateGeneratedAudio(blob: Blob): void {
  if (!blob.size) throw new Error("The clone engine returned an empty audio artifact.");
  if (blob.type && !blob.type.toLowerCase().startsWith("audio/"))
    throw new Error(`The clone engine returned an unexpected artifact type: ${blob.type}.`);
  if (blob.size < 4096)
    throw new Error("The clone engine returned an audio artifact that is too small to be usable.");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds.`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

async function generateWithQwen(
  reference: Blob,
  refText: string,
  text: string,
  language: string,
): Promise<Blob> {
  const app = await withTimeout(
    Client.connect(QWEN_SPACE, { events: ["data", "status"] }),
    20000,
    "Connecting to Qwen",
  );
  // 0.6B is deliberately attempted before 1.7B when the shared GPU is busy: it is
  // materially more likely to finish inside the public Space's GPU time budget.
  const attempts: Array<[string, boolean]> = [
    ["0.6B", false],
    ["1.7B", false],
    ["0.6B", true],
  ];
  let last = "Qwen ended without returning clone audio.";
  for (const [size, xVectorOnly] of attempts) {
    try {
      const job = app.submit(QWEN_CLONE_ENDPOINT, [
        handle_file(reference),
        refText.trim(),
        text.trim(),
        cloneLanguage(language),
        xVectorOnly,
        size,
      ]);
      const consume = (async () => {
        for await (const message of job) {
          if (message.type === "status" && message.stage === "error")
            last = String(message.message || "Qwen reported a generation error.");
          if (message.type === "data") {
            const data = message.data as unknown[];
            if (!Array.isArray(data) || !data[0])
              throw new Error("Qwen completed without clone audio.");
            const blob = await outputToBlob(data[0]);
            validateGeneratedAudio(blob);
            return blob;
          }
        }
        throw new Error("Qwen completed without clone audio.");
      })();
      return await withTimeout(consume, 65000, `Qwen ${size}${xVectorOnly ? " x-vector" : " ICL"} clone`);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(last);
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { ...init, cache: "no-store" });
      if (response.ok || response.status < 500) return response;
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500 * (i + 1)));
  }
  throw last instanceof Error ? last : new Error("Voice clone service unavailable.");
}

async function waitForCpuQwen(): Promise<void> {
  let last = "CPU Qwen is unavailable.";
  for (let i = 0; i < 12; i++) {
    try {
      const response = await fetch(`${CPU_PROXY}/api/status`, { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { status?: string; message?: string; device?: string };
        if (data.status === "ready") return;
        last = data.message || data.status || last;
      } else last = `CPU Qwen status HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`CPU Qwen did not become ready: ${last}`);
}

async function generateWithCpuQwen(
  reference: Blob,
  refText: string,
  text: string,
  language: string,
): Promise<Blob> {
  await waitForCpuQwen();
  const form = new FormData();
  form.append("file", reference, "reference.wav");
  const upload = await withTimeout(
    fetchWithRetry(`${CPU_PROXY}/api/upload`, { method: "POST", body: form }),
    30000,
    "Uploading the reference to CPU Qwen",
  );
  if (!upload.ok) throw new Error(`CPU Qwen reference upload failed (${upload.status}).`);
  const uploaded = (await upload.json()) as { audio_id?: string };
  if (!uploaded.audio_id) throw new Error("CPU Qwen did not return a reference audio ID.");
  const clone = await withTimeout(
    fetchWithRetry(
      `${CPU_PROXY}/api/clone`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ref_audio_id: uploaded.audio_id,
          ref_text: refText.trim(),
          target_text: text.trim(),
          language: cloneLanguage(language),
          x_vector_only: false,
        }),
      },
      3,
    ),
    180000,
    "CPU Qwen clone generation",
  );
  if (!clone.ok) {
    const detail = (await clone.text()).slice(0, 300);
    throw new Error(`CPU Qwen clone failed (${clone.status})${detail ? `: ${detail}` : ""}`);
  }
  const generated = (await clone.json()) as { audio_id?: string; status?: string };
  if (!generated.audio_id || generated.status === "error")
    throw new Error("CPU Qwen completed without generated audio.");
  const audio = await withTimeout(
    fetchWithRetry(
      `${CPU_PROXY}/api/download/${encodeURIComponent(generated.audio_id)}`,
      {},
      3,
    ),
    30000,
    "Downloading the CPU Qwen clone",
  );
  if (!audio.ok)
    throw new Error(`CPU Qwen generated audio could not be downloaded (${audio.status}).`);
  const blob = await audio.blob();
  validateGeneratedAudio(blob);
  return blob;
}

export async function createRealVoiceClone(
  reference: Blob,
  refText: string,
  text = DEFAULT_CLONE_TEXT,
  language = "English",
): Promise<RealCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  const target = text.trim() || DEFAULT_CLONE_TEXT;
  const transcript = refText.trim();
  if (!transcript)
    throw new Error(
      "The reference transcript is still needed for the high-quality clone. Buddy can save the recording first; correct the transcript when it is available, then generate again.",
    );
  let primaryError: unknown;
  try {
    const blob = await generateWithQwen(reference, transcript, target, language);
    return { url: URL.createObjectURL(blob), provider: "Qwen3-TTS Base — official Space" };
  } catch (error) {
    primaryError = error;
  }
  try {
    const blob = await generateWithCpuQwen(reference, transcript, target, language);
    return { url: URL.createObjectURL(blob), provider: "Qwen3-TTS Base 1.7B — CPU fallback" };
  } catch (fallbackError) {
    const primary = primaryError instanceof Error ? primaryError.message : String(primaryError);
    const fallback = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    throw new Error(
      `Real clone generation failed. Official Qwen: ${primary} | CPU Qwen: ${fallback}`,
    );
  }
}

export async function speakWithRealVoiceClone(
  reference: Blob,
  refText: string,
  text = DEFAULT_CLONE_TEXT,
  language = "English",
): Promise<RealCloneResult> {
  return createRealVoiceClone(reference, refText, text, language);
}
