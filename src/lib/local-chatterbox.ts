const MODEL_SAMPLE_RATE = 24000;

let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
let encodePromise: Promise<void> | null = null;
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

function waitFor(type: string): Promise<MessageEvent["data"]> {
  const current = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === type) {
        cleanup();
        resolve(event.data);
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

async function load() {
  if (!loadPromise) {
    loadPromise = (async () => {
      getWorker().postMessage({ type: "load" });
      await waitFor("loaded");
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
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 3 || decoded.duration > 30) {
      throw new Error("Use a clear voice recording between 3 and 30 seconds.");
    }
    const length = Math.max(1, Math.ceil(decoded.duration * MODEL_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, MODEL_SAMPLE_RATE);
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

export type LocalCloneResult = {
  url: string;
  provider: string;
  duration: number;
};

export async function createLocalChatterboxClone(
  reference: Blob,
  text: string,
  exaggeration: number,
  onStatus?: (status: string) => void,
): Promise<LocalCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  onStatus?.("Loading the free local voice engine… first use may download about 1.5 GB.");
  await load();
  onStatus?.("Learning your voice from the recording…");
  const audio = await decodeAt24k(reference);
  if (!encodePromise) {
    encodePromise = (async () => {
      getWorker().postMessage({ type: "encode", audio: audio.buffer }, [audio.buffer]);
      await waitFor("encoded");
    })().catch((error) => {
      encodePromise = null;
      throw error;
    });
  } else {
    await encodePromise;
  }
  onStatus?.("Generating speech locally on this phone…");
  getWorker().postMessage({ type: "generate", text, exaggeration });
  const result = await waitFor("audio");
  const waveform = new Float32Array(result.waveform as ArrayBuffer);
  if (waveform.length < 2400) throw new Error("The local engine returned unusable audio.");
  const blob = wavBlob(waveform, Number(result.sampleRate) || MODEL_SAMPLE_RATE);
  if (blob.size < 4096) throw new Error("The local engine returned an empty audio result.");
  return {
    url: URL.createObjectURL(blob),
    provider: "Chatterbox local — WebGPU/WASM",
    duration: waveform.length / (Number(result.sampleRate) || MODEL_SAMPLE_RATE),
  };
}

export function resetLocalChatterbox() {
  worker?.terminate();
  worker = null;
  loadPromise = null;
  encodePromise = null;
  workerError = null;
}
