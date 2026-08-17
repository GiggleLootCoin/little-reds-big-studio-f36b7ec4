import { ChatterboxModel, ChatterboxProcessor, Tensor } from "@huggingface/transformers";

const MODEL_ID = "ttslab/chatterbox-turbo-webgpu";

type LocalChatterboxModel = {
  encode_speech: (audio: Tensor) => Promise<Record<string, unknown>>;
  generate: (inputs: Record<string, unknown>) => Promise<{ data: Float32Array }>;
};
type LocalProcessor = {
  _call: (text: string) => Promise<Record<string, unknown>>;
};

let model: LocalChatterboxModel | null = null;
let processor: LocalProcessor | null = null;
let speakerData: Record<string, unknown> | null = null;

async function detectWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function loadModel() {
  if (!(await detectWebGpu())) {
    throw new Error(
      "This Android browser does not expose WebGPU. The API-keyless local Chatterbox voice engine cannot run on this device.",
    );
  }
  self.postMessage({ type: "progress", message: "Preparing the lightweight WebGPU voice engine…" });
  try {
    processor = (await ChatterboxProcessor.from_pretrained(MODEL_ID)) as unknown as LocalProcessor;
    model = (await ChatterboxModel.from_pretrained(MODEL_ID, {
      device: "webgpu",
      dtype: {
        embed_tokens: "fp32",
        speech_encoder: "q4f16",
        language_model: "q4f16",
        conditional_decoder: "q4f16",
      },
      progress_callback: (progress: unknown) => self.postMessage({ type: "progress", progress }),
    })) as unknown as LocalChatterboxModel;
    self.postMessage({ type: "loaded", device: "webgpu" });
  } catch (error) {
    model = null;
    processor = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`The free local Chatterbox Turbo engine could not start: ${message}`);
  }
}

async function encode(audio: Float32Array) {
  if (!model) await loadModel();
  if (!model) throw new Error("The local Chatterbox model could not be loaded.");
  const tensor = new Tensor("float32", audio, [1, audio.length]);
  speakerData = await model.encode_speech(tensor);
}

async function generate(text: string, exaggeration: number) {
  if (!model || !processor || !speakerData) {
    throw new Error("Your reference-conditioned voice profile is not loaded yet.");
  }
  const inputs = await processor._call(text);
  const waveform = await model.generate({
    ...inputs,
    ...speakerData,
    exaggeration,
    max_new_tokens: 2048,
    repetition_penalty: 1.2,
    do_sample: true,
    temperature: 0.2,
  });
  const data = waveform.data;
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  self.postMessage({ type: "audio", sampleRate: 24000, waveform: buffer });
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
