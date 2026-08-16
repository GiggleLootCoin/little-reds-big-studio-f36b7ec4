const BACKEND = "huggingface-fal-chatterbox";
const VERSION = "voice-clone-v6.0";
const ROUTE = "https://router.huggingface.co/fal-ai/fal-ai/chatterbox/text-to-speech";
const DEFAULT_TEXT =
  "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";

type CloneEnv = { HF_TOKEN?: string };

type CloneBody = {
  audioBase64?: string;
  audio?: string;
  refAudio?: string;
  referenceAudio?: string;
  audioMimeType?: string;
  text?: string;
  target_text?: string;
  prompt?: string;
};

function headers(): Headers {
  const value = new Headers({ "cache-control": "no-store, no-cache, must-revalidate" });
  value.set("x-buddy-clone-backend", BACKEND);
  value.set("x-buddy-clone-version", VERSION);
  return value;
}

function errorJson(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json(
    { ok: false, backend: BACKEND, version: VERSION, error: message, ...extra },
    { status, headers: headers() },
  );
}

function normalizeMime(raw: string, name = ""): string {
  const mime = String(raw || "").toLowerCase().split(";")[0].trim();
  if (mime.startsWith("audio/")) return mime;
  const extension = name.toLowerCase().split(".").pop() || "";
  const byExtension: Record<string, string> = {
    wav: "audio/wav",
    wave: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/opus",
    webm: "audio/webm",
    flac: "audio/flac",
    amr: "audio/amr",
    3gp: "audio/3gpp",
    3gpp: "audio/3gpp",
  };
  return byExtension[extension] || "application/octet-stream";
}

function decodeBase64(value: string, fallbackMime = "audio/wav", fallbackName = "reference.wav") {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  const mime = normalizeMime(match?.[1] || fallbackMime, fallbackName);
  const raw = (match?.[2] || value).replace(/\s/g, "");
  let binary: string;
  try {
    binary = atob(raw);
  } catch {
    throw new Error("The uploaded voice sample was not valid base64 audio data.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

async function readCloneInput(request: Request): Promise<{
  bytes: Uint8Array;
  mime: string;
  name: string;
  text?: string;
  refText?: string;
  language?: string;
}> {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const candidate = ["audio", "file", "voice", "referenceAudio", "refAudio"]
      .map((key) => form.get(key))
      .find((value) => value instanceof File) as File | undefined;
    if (!candidate) throw new Error("No audio file was found in the upload. Use the audio field.");
    if (!candidate.size) throw new Error("The uploaded voice sample is empty.");
    const name = candidate.name || "voice-sample";
    const mime = normalizeMime(candidate.type, name);
    const text = String(form.get("text") || form.get("target_text") || form.get("prompt") || "").trim();
    const refText = String(form.get("refText") || form.get("referenceTranscript") || "").trim();
    const language = String(form.get("language") || "English").trim();
    return { bytes: new Uint8Array(await candidate.arrayBuffer()), mime, name, text, refText, language };
  }

  let body: CloneBody;
  try {
    body = (await request.json()) as CloneBody;
  } catch {
    throw new Error("The clone request was not valid JSON or multipart form data.");
  }
  const encoded = body.audioBase64 || body.audio || body.refAudio || body.referenceAudio;
  if (!encoded) throw new Error("A voice sample is required.");
  const decoded = decodeBase64(encoded, body.audioMimeType || "audio/wav", "reference.wav");
  return {
    bytes: decoded.bytes,
    mime: decoded.mime,
    name: "reference.wav",
    text: body.text?.trim() || body.target_text?.trim() || body.prompt?.trim() || "",
    refText: "",
    language: "English",
  };
}

function toDataUri(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return `data:${normalizeMime(mime)};base64,${btoa(binary)}`;
}

function audioResponse(bytes: Uint8Array, contentType: string): Response {
  if (bytes.byteLength < 4096)
    throw new Error("The voice service returned an empty or unusably small audio file.");
  const type = contentType.toLowerCase();
  const wav =
    bytes.byteLength >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WAVE";
  if (!type.startsWith("audio/") && !wav)
    throw new Error("The voice service returned non-audio data; clone was not marked ready.");
  const responseHeaders = headers();
  responseHeaders.set("content-type", type.startsWith("audio/") ? contentType : "audio/wav");
  responseHeaders.set("content-length", String(bytes.byteLength));
  responseHeaders.set("x-clone-provider", "Chatterbox via Hugging Face Inference Providers");
  responseHeaders.set("x-clone-verified", "true");
  return new Response(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    { status: 200, headers: responseHeaders },
  );
}

export function voiceCloneHealth(): Response {
  return Response.json(
    {
      ok: true,
      capability: "voice-clone",
      backend: BACKEND,
      version: VERSION,
      transcriptRequired: false,
      input: "multipart/form-data or JSON base64",
      uploadField: "audio",
    },
    { headers: headers() },
  );
}

export async function handleProductionVoiceClone(
  request: Request,
  env: CloneEnv,
): Promise<Response> {
  if (request.method !== "POST") return errorJson("POST required.", 405);
  if (!env.HF_TOKEN) return errorJson("Hugging Face voice service is not configured.", 503);

  try {
    const input = await readCloneInput(request);
    if (input.bytes.byteLength < 4096) throw new Error("The voice sample is too short or empty.");
    const text = input.text || DEFAULT_TEXT;

    const upstream = await fetch(ROUTE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        audio_url: toDataUri(input.bytes, input.mime),
        exaggeration: 0.5,
        temperature: 0.8,
        cfg: 0.5,
        seed: 0,
      }),
    });

    const type = upstream.headers.get("content-type") || "";
    const raw = new Uint8Array(await upstream.arrayBuffer());
    if (!upstream.ok) {
      const detail = new TextDecoder().decode(raw).slice(0, 1200);
      throw new Error(`Chatterbox generation failed (${upstream.status})${detail ? `: ${detail}` : ""}`);
    }

    if (type.toLowerCase().includes("json")) {
      const payload = JSON.parse(new TextDecoder().decode(raw)) as {
        audio?: { url?: string; content_type?: string; file_data?: string };
        error?: string;
      };
      if (payload.error) throw new Error(`Chatterbox generation error: ${payload.error}`);
      if (payload.audio?.file_data)
        return audioResponse(
          decodeBase64(payload.audio.file_data, payload.audio.content_type || "audio/wav").bytes,
          payload.audio.content_type || "audio/wav",
        );
      if (payload.audio?.url) {
        const audio = await fetch(payload.audio.url);
        if (!audio.ok) throw new Error(`Chatterbox returned unusable audio (${audio.status}).`);
        return audioResponse(
          new Uint8Array(await audio.arrayBuffer()),
          audio.headers.get("content-type") || "audio/wav",
        );
      }
      throw new Error("Chatterbox completed without returning audio.");
    }
    if (type.toLowerCase().startsWith("audio/")) return audioResponse(raw, type);
    throw new Error("Chatterbox returned no usable audio result.");
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Voice cloning failed.", 502);
  }
}
