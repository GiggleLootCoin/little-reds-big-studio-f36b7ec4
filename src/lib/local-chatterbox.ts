const MODEL_SAMPLE_RATE = 24000;

// Free local path: inference stays on the user's device; Hugging Face is used only for model-file delivery.
let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
let encodePromise: Promise<void> | null = null;
let encodedKey = "";
let workerError: Error | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/chatterbox-local.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("error", (event) => {
      workerError = new Error(event.message || "The local voice engine stopped unexpectedly.");
    });
  }
  return worker;
}

async function assertBrowserWebGpu(onStatus?: (status: string) => void) {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: (options?: unknown) => Promise<any> } }).gpu;
  if (!gpu) {
    throw new Error(
      "WebGPU is unavailable in this Android browser. Local Chatterbox cannot run here; no remote/preset voice will be substituted.",
    );
  }
  let adapter: any = null;
  try {
    adapter = await gpu.requestAdapter();
    if (!adapter) {
      adapter = await gpu.requestAdapter({ featureLevel: "compatibility" });
    }
  } catch {
    adapter = null;
  }
  if (!adapter) {
    throw new Error(
      "Chrome exposes WebGPU but this phone has no usable GPU adapter for local Chatterbox. Update Chrome and enable hardware acceleration, then retry.",
    );
  }
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number" && memory > 0 && memory < 3) {
    throw new Error(
      `This browser reports about ${memory} GB of device memory. The local Chatterbox model is too large to run reliably at that memory level. No fallback voice will be used.`,
    );
  }
  onStatus?.("WebGPU is available. Starting the local Chatterbox engine…");
}

function waitFor(type: string, onProgress?: (status: string) => void): Promise<MessageEvent["data"]> {
  const current = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === type) {
        cleanup();
        resolve(event.data);
      } else if (event.data?.type === "progress") {
        const progress = event.data.progress;
        if (typeof progress?.status === "string") {
          const pct = Number(progress.progress);
          onProgress?.(
            Number.isFinite(pct)
              ? `Downloading/preparing Chatterbox model… ${Math.round(pct)}%`
              : progress.status,
          );
        } else if (typeof event.data.message === "string") {
          onProgress?.(event.data.message);
        }
      } else if (event.data?.type === "error") {
        cleanup();
        reject(new Error(String(event.data.message || "Local Chatterbox failed.")));
      }
    };
    const onError = () => {
      cleanup();
      reject(workerError || new Error("The local voice engine stopped unexpectedly."));
    };
    const cleanup = () => {
      current.removeEventListener("message", onMessage);
      current.removeEventListener("error", onError);
    };
    current.addEventListener("message", onMessage);
    current.addEventListener("error", onError);
  });
}

async function load(onStatus?: (status: string) => void) {
  if (!loadPromise) {
    loadPromise = (async () => {
      await assertBrowserWebGpu(onStatus);
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      if (typeof memory === "number" && memory > 0 && memory < 3) {
        throw new Error(
          "This phone reports less than 3 GB of device memory. The local Chatterbox model needs more memory than this browser can safely provide.",
        );
      }
      // Register the listener BEFORE posting the message.
      const loaded = waitFor("loaded", onStatus);
      getWorker().postMessage({ type: "load" });
      await loaded;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

async function decodeAt24k(blob: Blob): Promise<Float32Array> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("This browser cannot run the local voice engine.");
  const OfflineAudioContextCtor =
    window.OfflineAudioContext ||
    (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!OfflineAudioContextCtor) {
    throw new Error("This browser cannot resample the reference recording for local Chatterbox.");
  }
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 3 || decoded.duration > 30) {
      throw new Error("Use a clear voice recording between 3 and 30 seconds.");
    }
    const length = Math.max(1, Math.ceil(decoded.duration * MODEL_SAMPLE_RATE));
    const offline = new OfflineAudioContextCtor(1, length, MODEL_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Float32Array(rendered.getChannelData(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function fingerprint(reference: Blob): Promise<string> {
  const bytes = new Uint8Array(await reference.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function wavBlob(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export type LocalCloneResult = { url: string; provider: string; duration: number };

export async function createLocalChatterboxClone(
  reference: Blob,
  text: string,
  exaggeration: number,
  onStatus?: (status: string) => void,
): Promise<LocalCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  onStatus?.("Checking this phone for local WebGPU Chatterbox support…");
  await load(onStatus);
  const key = await fingerprint(reference);
  onStatus?.(
    encodedKey === key
      ? "Using your saved local voice profile…"
      : "Conditioning Chatterbox on your actual reference recording…",
  );
  if (encodedKey !== key) {
    const audio = await decodeAt24k(reference);
    encodePromise = (async () => {
      const encoded = waitFor("encoded", onStatus);
      getWorker().postMessage({ type: "encode", audio: audio.buffer }, [audio.buffer]);
      await encoded;
    })().catch((error) => {
      encodePromise = null;
      encodedKey = "";
      throw error;
    });
    await encodePromise;
    encodedKey = key;
  } else if (encodePromise) {
    await encodePromise;
  }
  onStatus?.("Generating speech locally on this phone from your reference voice…");
  const audioResult = waitFor("audio", onStatus);
  getWorker().postMessage({ type: "generate", text, exaggeration });
  const result = await audioResult;
  const waveform = new Float32Array(result.waveform as ArrayBuffer);
  if (waveform.length < 2400) throw new Error("The local engine returned unusable audio.");
  const sampleRate = Number(result.sampleRate) || MODEL_SAMPLE_RATE;
  const blob = wavBlob(waveform, sampleRate);
  if (blob.size < 4096) throw new Error("The local engine returned an empty audio result.");
  return { url: URL.createObjectURL(blob), provider: "Chatterbox local — WebGPU", duration: waveform.length / sampleRate };
}

export function resetLocalChatterbox() {
  worker?.terminate();
  worker = null;
  loadPromise = null;
  encodePromise = null;
  encodedKey = "";
  workerError = null;
}