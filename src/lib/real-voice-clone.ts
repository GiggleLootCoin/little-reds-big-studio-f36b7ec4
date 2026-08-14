import { Client, handle_file } from "@gradio/client";

export type RealCloneResult = { url: string; provider: string; voiceId?: string };

const CHATTERBOX_SPACE = "ResembleAI/Chatterbox";
const DEFAULT_CLONE_TEXT =
  "Hi. I'm Buddy. This is a voice clone test. The voice you supplied is speaking these words.";

function validateAudioBlob(blob: Blob): void {
  if (!blob.size) throw new Error("The clone engine returned empty audio.");
  if (blob.size < 4096) throw new Error("The clone engine returned an unusably small audio file.");
  if (blob.type && !blob.type.toLowerCase().startsWith("audio/")) {
    throw new Error(`The clone engine returned ${blob.type}, not audio.`);
  }
}

async function outputToBlob(value: unknown): Promise<Blob> {
  if (value instanceof Blob) return value;
  if (typeof value === "string" && /^(https?:|blob:|data:)/i.test(value)) {
    const response = await fetch(value, { cache: "no-store" });
    if (!response.ok) throw new Error(`Generated audio download failed (${response.status}).`);
    return response.blob();
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["url", "path", "data"]) {
      if (object[key] !== value) {
        try {
          return await outputToBlob(object[key]);
        } catch {
          // Try the next representation.
        }
      }
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        return await outputToBlob(item);
      } catch {
        // Try the next output.
      }
    }
  }
  throw new Error("The clone engine returned no downloadable audio artifact.");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateWithChatterbox(
  reference: Blob,
  text: string,
  language: string,
): Promise<Blob> {
  const client = await withTimeout(
    Client.connect(CHATTERBOX_SPACE),
    20000,
    "Connecting to Chatterbox",
  );

  // Chatterbox clones directly from the reference audio. A transcript is not
  // required, which makes this the primary simple mobile clone path.
  const job = client.submit("/generate_tts_audio", {
    text_input: text,
    audio_prompt_path_input: handle_file(reference),
    exaggeration_input: 0.5,
    temperature_input: 0.8,
    seed_num_input: 0,
    cfgw_input: 0.5,
  });

  const consume = (async () => {
    let lastError = "Chatterbox finished without returning clone audio.";
    for await (const message of job) {
      if (message.type === "status" && message.stage === "error") {
        lastError = String(message.message || lastError);
      }
      if (message.type === "data") {
        const data = message.data as unknown[];
        if (!Array.isArray(data) || !data[0]) throw new Error(lastError);
        const blob = await outputToBlob(data[0]);
        validateAudioBlob(blob);
        return blob;
      }
    }
    throw new Error(lastError);
  })();

  return withTimeout(consume, 120000, "Chatterbox voice clone generation");
}

export async function createRealVoiceClone(
  reference: Blob,
  _refText = "",
  text = DEFAULT_CLONE_TEXT,
  language = "English",
): Promise<RealCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  const target = text.trim() || DEFAULT_CLONE_TEXT;
  const normalizedLanguage = language.trim() || "English";

  const blob = await generateWithChatterbox(reference, target, normalizedLanguage);
  return {
    url: URL.createObjectURL(blob),
    provider: "Chatterbox — Resemble AI voice clone",
  };
}

export async function speakWithRealVoiceClone(
  reference: Blob,
  refText = "",
  text = DEFAULT_CLONE_TEXT,
  language = "English",
): Promise<RealCloneResult> {
  return createRealVoiceClone(reference, refText, text, language);
}
