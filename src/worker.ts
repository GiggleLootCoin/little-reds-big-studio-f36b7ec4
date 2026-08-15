import studioServer from "./server";

type Env = { HF_TOKEN?: string; FAL_KEY?: string };

const CLONE_BACKEND = "fal-chatterbox-queue";
const CLONE_VERSION = "voice-clone-v5.0";
const FAL_MODEL = "fal-ai/chatterbox/text-to-speech";
const HF_ROUTE = "https://router.huggingface.co/fal-ai/fal-ai/chatterbox/text-to-speech";
const CLONE_TEXT = "Hi. I'm Buddy. This is my new voice. Let's make something brilliant together.";

function cloneHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  headers.set("cache-control", "no-store, no-cache, must-revalidate");
  headers.set("x-buddy-clone-backend", CLONE_BACKEND);
  headers.set("x-buddy-clone-version", CLONE_VERSION);
  return headers;
}

function decodeBase64(value: string): { bytes: Uint8Array; mime: string } {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  const mime = match?.[1] || "audio/wav";
  const raw = match?.[2] || value;
  const binary = atob(raw.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

function bodyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return `data:${mime || "audio/wav"};base64,${btoa(binary)}`;
}

function validatedAudioResponse(bytes: Uint8Array, contentType: string): Response {
  if (bytes.byteLength < 4096)
    throw new Error("The voice service returned an empty or unusably small audio file.");
  const type = contentType.toLowerCase();
  const looksLikeWav =
    bytes.byteLength >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WAVE";
  if (!type.startsWith("audio/") && !looksLikeWav)
    throw new Error("The voice service returned non-audio data; clone was not marked ready.");
  const headers = cloneHeaders();
  headers.set("content-type", type.startsWith("audio/") ? contentType : "audio/wav");
  headers.set("content-length", String(bytes.byteLength));
  headers.set("x-clone-provider", "Fal Chatterbox");
  headers.set("x-clone-verified", "true");
  return new Response(bodyArrayBuffer(bytes), { status: 200, headers });
}

async function falRequest(path: string, method: string, key: string, body?: unknown): Promise<any> {
  const response = await fetch(`https://queue.fal.run/${path}`, {
    method,
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: any = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    /* handled below */
  }
  if (!response.ok)
    throw new Error(`Fal request failed (${response.status}): ${raw.slice(0, 1200)}`);
  return payload;
}

async function uploadReferenceToFal(bytes: Uint8Array, mime: string, key: string): Promise<string> {
  const response = await fetch("https://rest.alpha.fal.ai/storage/upload", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": mime || "audio/wav" },
    body: bodyArrayBuffer(bytes),
  });
  const raw = await response.text();
  let payload: any = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    /* handled below */
  }
  if (!response.ok)
    throw new Error(`Fal audio upload failed (${response.status}): ${raw.slice(0, 1200)}`);
  const url = payload?.url || payload?.file?.url;
  if (!url) throw new Error("Fal accepted the reference audio but returned no hosted audio URL.");
  return url;
}

async function submitFalClone(
  bytes: Uint8Array,
  mime: string,
  text: string,
  key: string,
): Promise<string> {
  const audioUrl = await uploadReferenceToFal(bytes, mime, key);
  const result = await falRequest(FAL_MODEL, "POST", key, {
    input: {
      text: text.slice(0, 5000),
      audio_url: audioUrl,
      exaggeration: 0.5,
      temperature: 0.8,
      cfg: 0.5,
      seed: 0,
    },
  });
  const requestId = result?.request_id || result?.requestId;
  if (!requestId) throw new Error("Fal accepted the clone request but returned no request ID.");
  return requestId;
}

async function pollFalClone(requestId: string, key: string): Promise<Response> {
  const deadline = Date.now() + 170000;
  let delay = 1200;
  while (Date.now() < deadline) {
    const status = await falRequest(
      `${FAL_MODEL}/requests/${encodeURIComponent(requestId)}/status`,
      "GET",
      key,
    );
    const state = String(status?.status || "").toUpperCase();
    if (state === "COMPLETED" || state === "SUCCESS") {
      const result = await falRequest(
        `${FAL_MODEL}/requests/${encodeURIComponent(requestId)}`,
        "GET",
        key,
      );
      const audioUrl = result?.audio?.url || result?.data?.audio?.url;
      if (!audioUrl) throw new Error("Fal completed the clone but returned no audio URL.");
      const audio = await fetch(audioUrl);
      if (!audio.ok)
        throw new Error(`Fal generated audio could not be downloaded (${audio.status}).`);
      return validatedAudioResponse(
        new Uint8Array(await audio.arrayBuffer()),
        audio.headers.get("content-type") || "audio/wav",
      );
    }
    if (state === "FAILED" || state === "ERROR" || state === "CANCELLED") {
      throw new Error(`Fal Chatterbox job ${state.toLowerCase()}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.35), 6000);
  }
  throw new Error(`Fal Chatterbox job ${requestId} is still processing; try again shortly.`);
}

async function generateWithFal(
  bytes: Uint8Array,
  mime: string,
  text: string,
  env: Env,
): Promise<Response> {
  if (!env.FAL_KEY) throw new Error("FAL_KEY is not configured in Cloudflare.");
  if (bytes.byteLength < 4096) throw new Error("The voice sample is too short or empty.");
  const requestId = await submitFalClone(bytes, mime, text, env.FAL_KEY);
  return await pollFalClone(requestId, env.FAL_KEY);
}

async function generateWithHfFallback(
  bytes: Uint8Array,
  mime: string,
  text: string,
  env: Env,
): Promise<Response> {
  if (!env.HF_TOKEN) throw new Error("Hugging Face voice service is not configured.");
  const response = await fetch(HF_ROUTE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.HF_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      audio_url: bytesToDataUri(bytes, mime),
      exaggeration: 0.5,
      temperature: 0.8,
      cfg: 0.5,
      seed: 0,
    }),
  });
  const raw = new Uint8Array(await response.arrayBuffer());
  if (!response.ok)
    throw new Error(
      `Hugging Face fallback failed (${response.status}): ${new TextDecoder().decode(raw).slice(0, 1000)}`,
    );
  const contentType = response.headers.get("content-type") || "";
  if (contentType.startsWith("audio/")) return validatedAudioResponse(raw, contentType);
  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new Error("Hugging Face returned invalid audio data.");
  }
  if (payload?.audio?.file_data) {
    const decoded = decodeBase64(payload.audio.file_data);
    return validatedAudioResponse(decoded.bytes, payload.audio.content_type || "audio/wav");
  }
  if (payload?.audio?.url) {
    const audio = await fetch(payload.audio.url);
    if (!audio.ok) throw new Error(`Hugging Face audio download failed (${audio.status}).`);
    return validatedAudioResponse(
      new Uint8Array(await audio.arrayBuffer()),
      audio.headers.get("content-type") || "audio/wav",
    );
  }
  throw new Error("Hugging Face completed without returning audio.");
}

async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  let body: {
    audioBase64?: string;
    audio?: string;
    refAudio?: string;
    referenceAudio?: string;
    audioMimeType?: string;
    text?: string;
    target_text?: string;
    prompt?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { ok: false, error: "The clone request was not valid JSON." },
      { status: 400, headers: cloneHeaders() },
    );
  }
  const encodedAudio = body.audioBase64 || body.audio || body.refAudio || body.referenceAudio;
  if (!encodedAudio)
    return Response.json(
      { ok: false, error: "A voice sample is required." },
      { status: 400, headers: cloneHeaders() },
    );
  try {
    const decoded = decodeBase64(encodedAudio);
    const mime = body.audioMimeType || decoded.mime || "audio/wav";
    const text = body.text?.trim() || body.target_text?.trim() || body.prompt?.trim() || CLONE_TEXT;
    try {
      return await generateWithFal(decoded.bytes, mime, text, env);
    } catch (falError) {
      console.warn("Direct Fal Chatterbox failed; trying HF fallback", falError);
      return await generateWithHfFallback(decoded.bytes, mime, text, env);
    }
  } catch (error) {
    return Response.json(
      {
        ok: false,
        backend: CLONE_BACKEND,
        version: CLONE_VERSION,
        error: error instanceof Error ? error.message : "Voice cloning failed.",
      },
      { status: 502, headers: cloneHeaders() },
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === "/api/ai/voice-clone" && request.method === "GET")
      return Response.json(
        {
          ok: true,
          capability: "voice-clone",
          backend: CLONE_BACKEND,
          version: CLONE_VERSION,
          transcriptRequired: false,
          falConfigured: Boolean(env.FAL_KEY),
        },
        { headers: cloneHeaders() },
      );
    if (path === "/api/ai/voice-clone" && request.method === "POST")
      return handleVoiceClone(request, env);
    if (path === "/api/ai" && request.method === "POST") {
      try {
        const body = (await request.clone().json()) as { capability?: string };
        const capability = String(body.capability || "")
          .toLowerCase()
          .replace(/_/g, "-");
        if (["voice-clone", "voiceclone", "clone"].includes(capability))
          return handleVoiceClone(request, env);
      } catch {
        /* normal API handler handles malformed generic requests */
      }
    }
    return studioServer.fetch(request, env, ctx);
  },
};
