import { AutoProcessor, ChatterboxModel, Tensor } from "@huggingface/transformers";

// Official Transformers.js Chatterbox voice-cloning model. Model files are
// downloaded directly to the browser; inference remains local/WebGPU.
const MODEL_ID = "onnx-community/chatterbox-ONNX";
const SAMPLE_RATE = 24000;
const MAX_NEW_TOKENS = 256;

type TensorLike = {
  data?: ArrayLike<number>;
  dims?: number[];
  size?: number;
};

type SpeakerConditioning = {
  audio_features: TensorLike;
  audio_tokens: TensorLike;
  speaker_embeddings: TensorLike;
  speaker_features: TensorLike;
};
type LocalChatterboxModel = {
  encode_speech: (audio: TensorLike) => Promise<SpeakerConditioning>;
  generate: (inputs: Record<string, unknown>) => Promise<TensorLike>;
};
type LocalProcessor = {
  (text: string): Promise<Record<string, unknown>>;
};

let model: LocalChatterboxModel | null = null;
let processor: LocalProcessor | null = null;
let speakerConditioning: SpeakerConditioning | null = null;

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
  self.postMessage({
    type: "progress",
    message:
      "Preparing the local Chatterbox voice-cloning engine… first use downloads the model files.",
  });
  try {
    // AutoProcessor is the supported Transformers.js v4 processor entry point.
    processor = (await AutoProcessor.from_pretrained(MODEL_ID)) as unknown as LocalProcessor;
    // Chatterbox's WebGPU language-model variant is q4f16. The speech encoder,
    // embed tokens, and conditional decoder remain fp32.
    model = (await ChatterboxModel.from_pretrained(MODEL_ID, {
      device: "webgpu",
      dtype: {
        embed_tokens: "fp32",
        speech_encoder: "fp32",
        language_model: "q4f16",
        conditional_decoder: "fp32",
      },
      progress_callback: (progress: unknown) => self.postMessage({ type: "progress", progress }),
    })) as unknown as LocalChatterboxModel;
    self.postMessage({ type: "loaded", device: "webgpu", model: MODEL_ID });
  } catch (error) {
    model = null;
    processor = null;
    speakerConditioning = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`The free local Chatterbox voice-cloning engine could not start: ${message}`);
  }
}

function assertConditioning(conditioning: SpeakerConditioning): SpeakerConditioning {
  const required: Array<keyof SpeakerConditioning> = [
    "audio_features",
    "audio_tokens",
    "speaker_embeddings",
    "speaker_features",
  ];
  for (const key of required) {
    const tensor = conditioning?.[key];
    if (!tensor || !Array.isArray(tensor.dims) || tensor.dims.length === 0 || tensor.size === 0) {
      throw new Error(`Chatterbox returned invalid speaker-conditioning tensor: ${key}.`);
    }
  }
  return conditioning;
}

async function encode(audio: Float32Array) {
  if (!model || !processor) await loadModel();
  if (!model || !processor) throw new Error("The local Chatterbox model could not be loaded.");
  if (audio.length < SAMPLE_RATE * 3) {
    throw new Error("The uploaded reference recording is too short after decoding.");
  }

  // The uploaded reference has already been decoded and resampled to 24 kHz by
  // local-chatterbox.ts. ChatterboxModel.encode_speech expects a float32 Tensor
  // shaped [batch, samples]; do not re-tokenize or substitute a preset speaker.
  const reference = new Tensor("float32", audio, [1, audio.length]);
  const encoded = assertConditioning(await model.encode_speech(reference));
  speakerConditioning = encoded;
  self.postMessage({
    type: "encoded",
    conditioning: {
      audioFeatures: encoded.audio_features.dims,
      audioTokens: encoded.audio_tokens.dims,
      speakerEmbeddings: encoded.speaker_embeddings.dims,
      speakerFeatures: encoded.speaker_features.dims,
    },
  });
}

async function generate(text: string, exaggeration: number) {
  if (!model || !processor || !speakerConditioning) {
    throw new Error("Your uploaded reference voice has not been conditioned yet.");
  }
  const inputs = await processor(text);
  if (!inputs.input_ids || !inputs.attention_mask) {
    throw new Error("Chatterbox could not tokenize the requested speech text.");
  }

  // ChatterboxModel.generate consumes the exact result of encode_speech when
  // these four conditioning tensors are supplied. Keeping the object spread is
  // intentional: it matches the Transformers.js generation contract and ensures
  // audio_tokens reach the conditional decoder through generate().
  const waveform = await model.generate({
    ...inputs,
    ...speakerConditioning,
    exaggeration,
    max_new_tokens: MAX_NEW_TOKENS,
  });
  if (!waveform.data || waveform.data.length === 0) {
    throw new Error("Chatterbox generation returned empty audio.");
  }
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
