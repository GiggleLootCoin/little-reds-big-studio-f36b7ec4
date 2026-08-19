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
type WorkerPoster = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerPoster = self as unknown as WorkerPoster;
let model: LocalChatterboxModel | null = null;
let processor: LocalProcessor | null = null;
let speakerConditioning: SpeakerConditioning | null = null;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 600);
}

async function detectWebGpu(): Promise<void> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) {
    throw new Error(
      "[webgpu-unavailable] This Android browser does not expose WebGPU. The API-keyless local Chatterbox voice engine cannot run on this device.",
    );
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error(
        "[webgpu-adapter] Chrome exposes WebGPU but no usable GPU adapter was returned for local Chatterbox.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[webgpu-adapter]")) throw error;
    throw new Error(`[webgpu-adapter] WebGPU adapter request failed: ${errorMessage(error)}`);
  }
}

async function loadModel() {
  await detectWebGpu();
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number" && memory > 0 && memory < 3) {
    throw new Error(
      `[device-memory] This browser reports about ${memory} GB of device memory. The local Chatterbox model is too large to run reliably at that memory level.`,
    );
  }
  workerPoster.postMessage({
    type: "progress",
    message:
      "Preparing the local Chatterbox voice-cloning engine… first use downloads the model files.",
  });
  try {
    processor = (await AutoProcessor.from_pretrained(MODEL_ID)) as unknown as LocalProcessor;
    model = (await ChatterboxModel.from_pretrained(MODEL_ID, {
      device: "webgpu",
      dtype: {
        embed_tokens: "fp32",
        speech_encoder: "fp32",
        language_model: "q4f16",
        conditional_decoder: "fp32",
      },
      progress_callback: (progress: unknown) =>
        workerPoster.postMessage({ type: "progress", progress }),
    })) as unknown as LocalChatterboxModel;
    workerPoster.postMessage({ type: "loaded", device: "webgpu", model: MODEL_ID });
  } catch (error) {
    model = null;
    processor = null;
    speakerConditioning = null;
    throw new Error(`[model-load] The free local Chatterbox voice-cloning engine could not start: ${errorMessage(error)}`);
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
  if (!model || !processor) throw new Error("[model-load] The local Chatterbox model could not be loaded.");
  if (audio.length < SAMPLE_RATE * 3) {
    throw new Error("[encode-speech] The uploaded reference recording is too short after decoding.");
  }

  const reference = new Tensor("float32", audio, [1, audio.length]);
  try {
    const encoded = assertConditioning(await model.encode_speech(reference));
    speakerConditioning = encoded;
    workerPoster.postMessage({
      type: "encoded",
      conditioning: {
        audioFeatures: encoded.audio_features.dims,
        audioTokens: encoded.audio_tokens.dims,
        speakerEmbeddings: encoded.speaker_embeddings.dims,
        speakerFeatures: encoded.speaker_features.dims,
      },
    });
  } catch (error) {
    throw new Error(`[encode-speech] Chatterbox encode_speech failed: ${errorMessage(error)}`);
  }
}

async function generate(text: string, exaggeration: number) {
  if (!model || !processor || !speakerConditioning) {
    throw new Error("[generate] Your uploaded reference voice has not been conditioned yet.");
  }
  try {
    const inputs = await processor(text);
    if (!inputs.input_ids || !inputs.attention_mask) {
      throw new Error("Chatterbox could not tokenize the requested speech text.");
    }

    const waveform = await model.generate({
      ...inputs,
      ...speakerConditioning,
      exaggeration,
      max_new_tokens: MAX_NEW_TOKENS,
    });
    if (!waveform.data || waveform.data.length === 0) {
      throw new Error("Chatterbox generation returned empty audio.");
    }
    const data = Float32Array.from(waveform.data);
    const buffer = data.buffer;
    workerPoster.postMessage({ type: "audio", sampleRate: SAMPLE_RATE, waveform: buffer }, [buffer]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[generate]")) throw error;
    throw new Error(`[generate] Chatterbox speech generation failed: ${errorMessage(error)}`);
  }
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
      if (!message.audio) throw new Error("[encode-speech] No voice sample was supplied to the local engine.");
      await encode(new Float32Array(message.audio));
    } else if (message.type === "generate") {
      await generate(message.text || "Hello from Buddy.", message.exaggeration ?? 0.5);
    }
  } catch (error) {
    workerPoster.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : `[worker-initialization] ${errorMessage(error)}`,
    });
  }
});