import { ChatterboxModel, ChatterboxProcessor, RawAudio } from "@huggingface/transformers";

// Official Transformers.js Chatterbox voice-cloning model. Model files are
// downloaded directly to the browser; inference remains local/WebGPU.
const MODEL_ID = "onnx-community/chatterbox-ONNX";
const SAMPLE_RATE = 24000;

type SpeakerConditioning = {
  audio_features: unknown;
  audio_tokens: unknown;
  speaker_embeddings: unknown;
  speaker_features: unknown;
};
type LocalChatterboxModel = {
  encode_speech: (audio: unknown) => Promise<SpeakerConditioning>;
  generate: (inputs: Record<string, unknown>) => Promise<{ data: Float32Array }>;
};
type LocalProcessor = {
  (text: string, audio?: unknown): Promise<Record<string, unknown>>;
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
    speakerConditioning = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`The free local Chatterbox voice-cloning engine could not start: ${message}`);
  }
}

async function encode(audio: Float32Array) {
  if (!model || !processor) await loadModel();
  if (!model || !processor) throw new Error("The local Chatterbox model could not be loaded.");

  // This is the official Transformers.js Chatterbox conditioning contract:
  // RawAudio -> processor audio features -> speech encoder -> four conditioning tensors.
  // Keep every returned tensor; the conditional decoder needs both speaker fields
  // as well as the audio token/features returned by the speech encoder.
  const reference = new RawAudio(audio, SAMPLE_RATE);
  const inputs = await processor("", reference);
  const audioValues = inputs.audio_values;
  if (!audioValues) {
    throw new Error("Chatterbox could not prepare the uploaded reference recording.");
  }
  const encoded = await model.encode_speech(audioValues);
  if (
    !encoded ||
    !encoded.audio_features ||
    !encoded.audio_tokens ||
    !encoded.speaker_embeddings ||
    !encoded.speaker_features
  ) {
    throw new Error("Chatterbox could not extract usable speaker-conditioning data from your reference recording.");
  }
  speakerConditioning = encoded;
  self.postMessage({ type: "encoded" });
}

async function generate(text: string, exaggeration: number) {
  if (!model || !processor || !speakerConditioning) {
    throw new Error("Your uploaded reference voice has not been conditioned yet.");
  }
  const inputs = await processor(text);
  if (!inputs.input_ids || !inputs.attention_mask) {
    throw new Error("Chatterbox could not tokenize the requested speech text.");
  }

  // Pass the exact four tensors explicitly. This prevents the reference speaker
  // conditioning from being lost through an untyped object spread.
  const waveform = await model.generate({
    input_ids: inputs.input_ids,
    attention_mask: inputs.attention_mask,
    audio_features: speakerConditioning.audio_features,
    audio_tokens: speakerConditioning.audio_tokens,
    speaker_embeddings: speakerConditioning.speaker_embeddings,
    speaker_features: speakerConditioning.speaker_features,
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
  self.postMessage({ type: "audio", sampleRate: SAMPLE_RATE, waveform: buffer });
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
