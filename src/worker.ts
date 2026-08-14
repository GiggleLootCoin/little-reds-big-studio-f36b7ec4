import studioServer from "./server";

type Env = { HF_TOKEN?: string };

const CLONE_BACKEND = "huggingface-fal-chatterbox";
const CLONE_VERSION = "voice-clone-v3";
const CHATTERBOX_ROUTE = "https://router.huggingface.co/fal-ai/fal-ai/chatterbox/text-to-speech";
const CLONE_TEXT = "Hi. I'm Buddy. This is my new voice. Let's make something brilliant together.";

function decodeBase64(value: string): Uint8Array {
  const raw = value.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), ms)),
  ]);
}

function cloneHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  headers.set("cache-control", "no-store, no-cache, must-revalidate");
  headers.set("x-buddy-clone-backend", CLONE_BACKEND);
  headers.set("x-buddy-clone-version", CLONE_VERSION);
  return headers;
}

async function generateWithHfChatterbox(
  referenceAudio: Blob,
  text: string,
  env: Env,
): Promise<Response> {
  if (!env.HF_TOKEN) throw new Error("Hugging Face voice service is not configured.");

  const bytes = new Uint8Array(await referenceAudio.arrayBuffer());
  if (bytes.byteLength < 4096) throw new Error("The voice sample is too short or empty.");

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  const audioUrl = `data:audio/wav;base64,${btoa(binary)}`;

  const response = await withTimeout(
    fetch(CHATTERBOX_ROUTE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_TOKEN}`,
        "Content-Type": "application/json",
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

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Chatterbox generation failed (${response.status})${detail ? `: ${detail.slice(0, 800)}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    audio?: { url?: string; content_type?: string };
    error?: string;
  };
  if (payload.error) throw new Error(`Chatterbox generation error: ${payload.error}`);
  const audioUrlResult = payload.audio?.url;
  if (!audioUrlResult) throw new Error("Chatterbox completed without returning audio.");

  const audio = await withTimeout(fetch(audioUrlResult), 30000, "Downloading cloned audio");
  if (!audio.ok || !audio.body)
    throw new Error(`Chatterbox returned unusable audio (${audio.status}).`);

  const length = Number(audio.headers.get("content-length") || 0);
  if (length > 0 && length < 4096)
    throw new Error("Chatterbox returned an unusably small audio file.");

  const headers = cloneHeaders(audio.headers);
  headers.set("content-type", audio.headers.get("content-type") || "audio/wav");
  headers.set("x-clone-provider", "Chatterbox via Hugging Face Inference Providers");
  return new Response(audio.body, { status: 200, headers });
}

async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  let body: {
    audioBase64?: string;
    audio?: string;
    refAudio?: string;
    referenceAudio?: string;
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
    const bytes = decodeBase64(encodedAudio);
    if (bytes.byteLength < 4096) throw new Error("The voice sample is too short or empty.");
    const audioBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const referenceAudio = new Blob([audioBuffer], { type: "audio/wav" });
    const text = body.text?.trim() || body.target_text?.trim() || body.prompt?.trim() || CLONE_TEXT;
    return await generateWithHfChatterbox(referenceAudio, text, env);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Voice cloning failed." },
      { status: 502, headers: cloneHeaders() },
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    // Production diagnostic endpoint. It performs no generation and exposes no secrets.
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

    if (path === "/api/ai/voice-clone" && request.method === "POST") {
      return handleVoiceClone(request, env);
    }

    // Compatibility bridge for older UI bundles. Never send voice-clone into Workers AI.
    if ((path === "/api/ai" || path === "/api/ai/voice-clone") && request.method === "POST") {
      try {
        const body = (await request.clone().json()) as { capability?: string };
        const capability = String(body.capability || "")
          .toLowerCase()
          .replace(/_/g, "-");
        if (capability === "voice-clone" || capability === "voiceclone" || capability === "clone") {
          return handleVoiceClone(request, env);
        }
      } catch {
        // Fall through to the normal API error handling for malformed generic requests.
      }
    }

    return studioServer.fetch(request, env, ctx);
  },
};
