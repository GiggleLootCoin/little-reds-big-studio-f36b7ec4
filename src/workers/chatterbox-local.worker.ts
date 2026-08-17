import { ChatterboxModel, ChatterboxProcessor, RawAudio } from "@huggingface/transformers";

// Official Transformers.js Chatterbox voice-cloning model. Model files are
// downloaded directly to the browser; inference remains local/WebGPU.
const MODEL_ID = "onnx-community/chatterbox-ONNX";
const SAMPLE_RATE = 24000;

type LocalChatterboxModel = {
  encode_speech: (audio: unknown) => Promise<Record<string, unknown>>;
  generate: (inputs: Record<string, unknown>) => Promise<{ data: Float32Array }>;
};
type LocalProcessor = {
  _call: (text: string, audio?: unknown) => Promise<Record<string, unknown>>;
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
  self.postMessage({ type: "progress", message: "Preparing the local Chatterbox voice-cloning engine… first use downloads the model files." });
  try {
    processor = (await ChatterboxProcessor.from_pretrained(MODEL_ID)) as unknown as LocalProcessor;
    model = (await ChatterboxModel.from_pretrained(MODEL_ID, {
      device: "webgpu",
      dtype: {
        embed_tokens: "fp32",
        speech_encoder: "fp32",
        language_model: "q4",
        conditional_decoder: "fp32",
      },
      progress_callback: (progress: unknown) => self.postMessage({ type: "progress", progress }),
    })) as unknown as LocalChatterboxModel;
    self.postMessage({ type: "loaded", device: "webgpu", model: MODEL_ID });
  } catch (error) {
    model = null;
    processor = null;
    speakerData = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`The free local Chatterbox voice-cloning engine could not start: ${message}`);
  }
}

async function encode(audio: Float32Array) {
  if (!model || !processor) await loadModel();
  if (!model || !processor) throw new Error("The local Chatterbox model could not be loaded.");

  // Use the same processor path as the official Transformers.js cloning
  // example: reference audio is converted into the model's input_values
  // before encode_speech, rather than treating the raw PCM tensor as an
  // already-processed speaker input.
  const reference = new RawAudio(audio, SAMPLE_RATE);
  const inputs = await processor._call("", reference);
  if (!inputs.input_values) {
    throw new Error("Chatterbox could not extract speaker features from your reference recording.");
  }
  speakerData = await model.encode_speech(inputs.input_values);
  if (!speakerData || Object.keys(speakerData).length === 0) {
    throw new Error("Chatterbox returned no speaker-conditioning data for your reference recording.");
  }
}

async function generate(text: string, exaggeration: number) {
  if (!model || !processor || !speakerData) {
    throw new Error("Your reference-conditioned voice profile is not loaded yet.");
  }
  const inputs = await processor._call(text);
  const waveform = await model.generate({
    ...speakerData,
    input_ids: inputs.input_ids,
    attention_mask: inputs.attention_mask,
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
  self.postMessage({ type: "audio", sampleRate: SAMPLE_RATE, waveform: buffer }, [buffer]);
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
