import studioServer from "./server";

type Env = {
  XAI_API_KEY?: string;
};

function decodeBase64(value: string): Uint8Array {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return bytes;
}

function languageCode(value: unknown): string {
  const raw = String(value || "en").trim().toLowerCase();
  const map: Record<string, string> = {
    english: "en",
    spanish: "es",
    french: "fr",
    german: "de",
    dutch: "nl",
    italian: "it",
    portuguese: "pt",
    russian: "ru",
    chinese: "zh",
    japanese: "ja",
    korean: "ko",
    hindi: "hi",
    arabic: "ar",
  };
  return map[raw] || raw.split(/[-_]/)[0] || "en";
}

function errorResponse(message: string, status = 500) {
  return Response.json(
    { ok: false, error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}

async function handleXaiClone(request: Request, env: Env): Promise<Response> {
  if (!env.XAI_API_KEY) {
    return errorResponse(
      "Real custom voice cloning is not configured yet. Add XAI_API_KEY to this Worker under Settings → Variables and Secrets.",
      503,
    );
  }

  let body: { audioBase64?: string; text?: string; language?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("The clone request was not valid JSON.", 400);
  }

  if (!body.audioBase64) return errorResponse("A voice recording is required.", 400);
  const text = String(body.text || "This is a short test of my own voice.").trim();
  if (!text) return errorResponse("Clone preview text is empty.", 400);

  const audio = new Blob([decodeBase64(body.audioBase64)], { type: "audio/wav" });
  const form = new FormData();
  form.append("name", "Personal Studio Voice");
  form.append("description", "A verified personal voice for this studio account.");
  form.append("language", languageCode(body.language));
  form.append("use_case", "conversational");
  form.append("tone", "friendly");
  form.append("file", audio, "reference.wav");

  const create = await fetch("https://api.x.ai/v1/custom-voices", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
    body: form,
  });

  if (!create.ok) {
    const detail = await create.text().catch(() => "");
    if (create.status === 403) {
      return errorResponse(
        "xAI's custom-voice creation API is not enabled for this key. Create the personal voice once in the xAI Voice console, then use its Voice ID here; the API can use that voice for Buddy even when API creation is gated.",
        403,
      );
    }
    return errorResponse(`xAI custom voice creation failed (${create.status}). ${detail.slice(0, 300)}`, 502);
  }

  const created = (await create.json()) as { voice_id?: string };
  const voiceId = String(created.voice_id || "");
  if (!voiceId) return errorResponse("xAI created the voice but returned no Voice ID.", 502);

  const speech = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language: languageCode(body.language),
    }),
  });

  if (!speech.ok) {
    const detail = await speech.text().catch(() => "");
    return errorResponse(`The custom voice was created, but preview synthesis failed (${speech.status}). ${detail.slice(0, 300)}`, 502);
  }

  const headers = new Headers(speech.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-voice-id", voiceId);
  headers.set("x-clone-provider", "xAI Custom Voice");
  return new Response(speech.body, { status: 200, headers });
}

async function handleXaiTts(request: Request, env: Env, body: Record<string, unknown>): Promise<Response> {
  if (!env.XAI_API_KEY) return errorResponse("xAI voice service is not configured.", 503);
  const voiceId = String(body.voiceId || "").trim();
  const text = String(body.text || body.prompt || "").trim();
  if (!voiceId || !text) return errorResponse("A verified voice ID and text are required.", 400);
  const response = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language: languageCode(body.language),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return errorResponse(`Custom voice playback failed (${response.status}). ${detail.slice(0, 300)}`, 502);
  }
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-voice-id", voiceId);
  headers.set("x-clone-provider", "xAI Custom Voice");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ai/voice-clone" && request.method === "POST") {
      return handleXaiClone(request, env);
    }
    if (url.pathname === "/api/ai/tts" && request.method === "POST" && env.XAI_API_KEY) {
      try {
        const cloneBody = (await request.clone().json()) as Record<string, unknown>;
        if (cloneBody.voiceId) return handleXaiTts(request, env, cloneBody);
      } catch {
        /* Delegate malformed/other requests to the existing runtime. */
      }
    }
    return studioServer.fetch(request, env, ctx);
  },
};
