import { ChatterboxModel, AutoProcessor, Tensor } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/chatterbox-ONNX";

type Device = "webgpu" | "wasm";

type DtypeConfig = {
  embed_tokens: "fp32";
  speech_encoder: "fp32";
  language_model: "q4" | "q4f16";
  conditional_decoder: "fp32";
};

let model: ChatterboxModel | null = null;
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
let speakerData: Record<string, unknown> | null = null;

const dtypeFor = (device: Device): DtypeConfig =>
  device === "webgpu"
    ? {
        embed_tokens: "fp32",
        speech_encoder: "fp32",
        language_model: "q4f16",
        conditional_decoder: "fp32",
      }
    : {
        embed_tokens: "fp32",
        speech_encoder: "fp32",
        language_model: "q4",
        conditional_decoder: "fp32",
      };

async function detectWebGpu(): Promise<boolean> {
  if (!("gpu" in navigator)) return false;
  try {
    return Boolean(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function loadModel() {
  const webgpu = await detectWebGpu();
  const device: Device = webgpu ? "webgpu" : "wasm";
  self.postMessage({ type: "progress", message: webgpu ? "Preparing WebGPU voice engine…" : "Preparing browser voice engine…" });
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  model = await ChatterboxModel.from_pretrained(MODEL_ID, {
    device,
    dtype: dtypeFor(device),
    progress_callback: (progress: unknown) => self.postMessage({ type: "progress", progress }),
  });
  self.postMessage({ type: "loaded", device });
}

async function encode(audio: Float32Array) {
  if (!model) await loadModel();
  if (!model) throw new Error("The local Chatterbox model could not be loaded.");
  const tensor = new Tensor("float32", audio, [1, audio.length]);
  speakerData = await model.encode_speech(tensor);
}

async function generate(text: string, exaggeration: number) {
  if (!model || !processor || !speakerData) {
    throw new Error("Your voice profile is not loaded yet.");
  }
  const inputs = await processor._call(text);
  const waveform = await model.generate({
    ...inputs,
    ...speakerData,
    exaggeration,
    max_new_tokens: 256,
    repetition_penalty: 1.2,
    do_sample: true,
    temperature: 0.2,
  });
  const data = waveform.data as Float32Array;
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  self.postMessage({ type: "audio", sampleRate: 24000, waveform: buffer }, [buffer]);
}

self.addEventListener("message", async (event: MessageEvent) => {
  const message = event.data as {
    type: string;
    audio?: ArrayBuffer;
    text?: string;
    exaggeration?: number;
  };
  try {
    if (message.type === "load") await loadModel();
    else if (message.type === "encode") {
      if (!message.audio) throw new Error("No voice sample was supplied to the local engine.");
      await encode(new Float32Array(message.audio));
      self.postMessage({ type: "encoded" });
    } else if (message.type === "generate") {
      await generate(message.text || "Hello from Buddy.", message.exaggeration ?? 0.5);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Local Chatterbox failed.",
    });
  }
});
