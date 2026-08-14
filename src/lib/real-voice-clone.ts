export type RealCloneResult = { url: string; provider: string; voiceId?: string };

const CHATTERBOX_SPACE = "ResembleAI/Chatterbox";
const CHATTERBOX_PROXY = `/api/hf-space/${encodeURIComponent(CHATTERBOX_SPACE)}`;
const DEFAULT_CLONE_TEXT =
  "Hi. I'm Buddy. This is a voice clone test. The voice you supplied is speaking these words.";

function validateAudioBlob(blob: Blob): void {
  if (!blob.size) throw new Error("The clone engine returned empty audio.");
  if (blob.size < 4096) throw new Error("The clone engine returned an unusably small audio file.");
  if (blob.type && !blob.type.toLowerCase().startsWith("audio/")) {
    throw new Error(`The clone engine returned ${blob.type}, not audio.`);
  }
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

function proxyPath(path: string): string {
  return `${CHATTERBOX_PROXY}/${path.replace(/^\/+/, "")}`;
}

function absoluteAudioUrl(value: string): string {
  if (/^https?:\/\/resembleai-chatterbox\.hf\.space\//i.test(value)) {
    const url = new URL(value);
    return proxyPath(`${url.pathname.replace(/^\/+/, "")}${url.search}`);
  }
  if (/^https?:\/\//i.test(value)) return value;
  return proxyPath(value);
}

async function uploadReference(reference: Blob): Promise<string> {
  const form = new FormData();
  form.append("files", reference, "voice-reference.wav");
  const response = await withTimeout(
    fetch(`${CHATTERBOX_PROXY}/gradio_api/upload`, { method: "POST", body: form }),
    30000,
    "Uploading reference voice",
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Chatterbox reference upload failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}.`,
    );
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || typeof payload[0] !== "string") {
    throw new Error("Chatterbox did not return an uploaded reference path.");
  }
  return payload[0];
}

async function readCompletion(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Chatterbox returned an empty generation stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastData: unknown;
  const parseBlock = (block: string): unknown | undefined => {
    const event = block
      .split(/\r?\n/)
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim()
      .toLowerCase();
    const dataLine = block.split(/\r?\n/).find((line) => line.startsWith("data:"));
    let data: unknown;
    if (dataLine) {
      const raw = dataLine.slice(5).trim();
      if (raw && raw !== "null") {
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
        lastData = data;
      }
    }
    if (event === "error")
      throw new Error(typeof data === "string" ? data : "Chatterbox reported a generation error.");
    if (event === "complete") return data ?? lastData;
    return undefined;
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const completed = parseBlock(block);
      if (completed !== undefined) {
        reader.cancel().catch(() => undefined);
        return completed;
      }
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const completed = parseBlock(buffer);
    if (completed !== undefined) return completed;
  }
  throw new Error("Chatterbox ended without a completed generation event.");
}

async function outputToBlob(value: unknown): Promise<Blob> {
  if (value instanceof Blob) return value;
  if (typeof value === "string" && /^(https?:|blob:|data:)/i.test(value)) {
    const response = await fetch(absoluteAudioUrl(value), { cache: "no-store" });
    if (!response.ok) throw new Error(`Generated audio download failed (${response.status}).`);
    return response.blob();
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["url", "path"])
      if (typeof object[key] === "string") return outputToBlob(String(object[key]));
    for (const key of ["data", "value", "output", "result"])
      if (object[key] !== undefined) {
        try {
          return await outputToBlob(object[key]);
        } catch {
          /* try next */
        }
      }
  }
  if (Array.isArray(value))
    for (const item of value) {
      try {
        return await outputToBlob(item);
      } catch {
        /* try next */
      }
    }
  throw new Error("The clone engine returned no downloadable audio artifact.");
}

async function generateWithChatterbox(reference: Blob, text: string): Promise<Blob> {
  if (reference.size < 4096) throw new Error("The reference recording is too small to clone.");
  const uploadedPath = await uploadReference(reference);
  const request = await withTimeout(
    fetch(`${CHATTERBOX_PROXY}/gradio_api/call/generate_tts_audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // The live Space has seven inputs. gr.Audio(type="filepath") expects the uploaded filepath string directly.
        data: [text.slice(0, 300), uploadedPath, 0.5, 0.8, 0, 0.5, false],
      }),
    }),
    30000,
    "Starting Chatterbox voice clone",
  );
  if (!request.ok) {
    const detail = await request.text().catch(() => "");
    throw new Error(
      `Chatterbox clone request failed (${request.status})${detail ? `: ${detail.slice(0, 300)}` : ""}.`,
    );
  }
  const start = (await request.json()) as { event_id?: string };
  if (!start.event_id) throw new Error("Chatterbox did not return a generation event ID.");
  const completion = await withTimeout(
    fetch(
      `${CHATTERBOX_PROXY}/gradio_api/call/generate_tts_audio/${encodeURIComponent(start.event_id)}`,
    ),
    180000,
    "Chatterbox voice clone generation",
  );
  if (!completion.ok) {
    const detail = await completion.text().catch(() => "");
    throw new Error(
      `Chatterbox generation failed (${completion.status})${detail ? `: ${detail.slice(0, 300)}` : ""}.`,
    );
  }
  const result = await readCompletion(completion);
  const blob = await outputToBlob(result);
  validateAudioBlob(blob);
  return blob;
}

export async function createRealVoiceClone(
  reference: Blob,
  _refText = "",
  text = DEFAULT_CLONE_TEXT,
  _language = "English",
): Promise<RealCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  const blob = await generateWithChatterbox(reference, text.trim() || DEFAULT_CLONE_TEXT);
  return { url: URL.createObjectURL(blob), provider: "Chatterbox — Resemble AI voice clone" };
}

export async function speakWithRealVoiceClone(
  reference: Blob,
  refText = "",
  text = DEFAULT_CLONE_TEXT,
  language = "English",
): Promise<RealCloneResult> {
  return createRealVoiceClone(reference, refText, text, language);
}
