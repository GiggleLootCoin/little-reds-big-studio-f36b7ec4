import studioServer from "./server";

type Env = { HF_TOKEN?: string };

const CLONE_BACKEND = "huggingface-fal-chatterbox";
const CLONE_VERSION = "voice-clone-v4.1";
const CHATTERBOX_ROUTE = "https://router.huggingface.co/fal-ai/fal-ai/chatterbox/text-to-speech";
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), ms)),
  ]);
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return `data:${mime || "audio/wav"};base64,${btoa(binary)}`;
}

function bodyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function generateWithHfChatterbox(
  referenceBytes: Uint8Array,
  referenceMime: string,
  text: string,
  env: Env,
): Promise<Response> {
  if (!env.HF_TOKEN) throw new Error("Hugging Face voice service is not configured.");
  if (referenceBytes.byteLength < 4096) throw new Error("The voice sample is too short or empty.");

  const audioUrl = bytesToDataUri(referenceBytes, referenceMime);
  const response = await withTimeout(
    fetch(CHATTERBOX_ROUTE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        audio_url: audioUrl,
        exaggeration: 0.5,
        temperature: 0.8,
        cfg: 0.5,
        seed: 0,
      }),
    }),
    180000,
    "Chatterbox voice clone generation",
  );

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.arrayBuffer();
  const rawBytes = new Uint8Array(raw);

  if (!response.ok) {
    const detail = new TextDecoder().decode(rawBytes).slice(0, 1200);
    throw new Error(
      `Chatterbox generation failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  let audioUrlResult: string | undefined;
  if (contentType.toLowerCase().includes("json")) {
    let payload: {
      audio?: { url?: string; content_type?: string; file_data?: string };
      error?: string;
    };
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBytes)) as typeof payload;
    } catch {
      throw new Error("Chatterbox returned invalid JSON instead of an audio result.");
    }
    if (payload.error) throw new Error(`Chatterbox generation error: ${payload.error}`);
    if (payload.audio?.file_data) {
      const decoded = decodeBase64(payload.audio.file_data);
      return validatedAudioResponse(decoded.bytes, payload.audio.content_type || "audio/wav");
    }
    audioUrlResult = payload.audio?.url;
  } else if (contentType.startsWith("audio/")) {
    return validatedAudioResponse(rawBytes, contentType);
  }

  if (!audioUrlResult) throw new Error("Chatterbox completed without returning audio.");

  const audio = await withTimeout(fetch(audioUrlResult), 30000, "Downloading cloned audio");
  if (!audio.ok) throw new Error(`Chatterbox returned unusable audio (${audio.status}).`);
  const audioBytes = new Uint8Array(await audio.arrayBuffer());
  return validatedAudioResponse(audioBytes, audio.headers.get("content-type") || "audio/wav");
}

function validatedAudioResponse(bytes: Uint8Array, contentType: string): Response {
  if (bytes.byteLength < 4096)
    throw new Error("The voice service returned an empty or unusably small audio file.");
  const type = contentType.toLowerCase();
  const looksLikeWav =
    bytes.byteLength >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WAVE";
  if (!type.startsWith("audio/") && !looksLikeWav) {
    throw new Error("The voice service returned non-audio data; clone was not marked ready.");
  }

  const headers = cloneHeaders();
  headers.set("content-type", type.startsWith("audio/") ? contentType : "audio/wav");
  headers.set("content-length", String(bytes.byteLength));
  headers.set("x-clone-provider", "Chatterbox via Hugging Face Inference Providers");
  headers.set("x-clone-verified", "true");
  return new Response(bodyArrayBuffer(bytes), { status: 200, headers });
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
  if (!encodedAudio) {
    return Response.json(
      { ok: false, error: "A voice sample is required." },
      { status: 400, headers: cloneHeaders() },
    );
  }

  try {
    const decoded = decodeBase64(encodedAudio);
    const mime = body.audioMimeType || decoded.mime || "audio/wav";
    const text = body.text?.trim() || body.target_text?.trim() || body.prompt?.trim() || CLONE_TEXT;
    return await generateWithHfChatterbox(decoded.bytes, mime, text, env);
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

    if (path === "/api/ai/voice-clone" && request.method === "GET") {
      return Response.json(
        {
          ok: true,
          capability: "voice-clone",
          backend: CLONE_BACKEND,
          version: CLONE_VERSION,
          transcriptRequired: false,
        },
        { headers: cloneHeaders() },
      );
    }

    if (path === "/api/ai/voice-clone" && request.method === "POST")
      return handleVoiceClone(request, env);

    if (path === "/api/ai" && request.method === "POST") {
      try {
        const body = (await request.clone().json()) as { capability?: string };
        const capability = String(body.capability || "")
          .toLowerCase()
          .replace(/_/g, "-");
        if (capability === "voice-clone" || capability === "voiceclone" || capability === "clone")
          return handleVoiceClone(request, env);
      } catch {
        // Let the normal API handler report malformed generic requests.
      }
    }

    return studioServer.fetch(request, env, ctx);
  },
};
