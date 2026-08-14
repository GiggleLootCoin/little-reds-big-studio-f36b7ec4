import studioServer from "./server";

type Env = {
  HF_TOKEN?: string;
  QWEN_TTS_SPACE_URL?: string;
};

function decodeBase64(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function languageName(value: unknown): string {
  const raw = String(value || "English").trim();
  const map: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    hi: "Hindi",
    ar: "Arabic",
  };
  return map[raw.toLowerCase()] || raw;
}

function errorResponse(message: string, status = 500) {
  return Response.json(
    { ok: false, error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function authHeaders(env: Env): HeadersInit {
  return env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {};
}

async function qwenUpload(space: string, audio: Blob, env: Env): Promise<string> {
  const form = new FormData();
  form.append("files", audio, "reference.wav");
  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    headers: authHeaders(env),
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Qwen reference upload failed (${response.status}). ${detail.slice(0, 240)}`);
  }
  const files = (await response.json()) as unknown;
  if (!Array.isArray(files) || typeof files[0] !== "string") {
    throw new Error("Qwen returned no uploaded reference path.");
  }
  return files[0];
}

async function qwenClone(
  space: string,
  path: string,
  refText: string,
  text: string,
  language: string,
  env: Env,
) {
  const fileData = {
    path,
    orig_name: "reference.wav",
    meta: { _type: "gradio.FileData" },
  };
  const start = await fetch(`${space}/gradio_api/call/generate_voice_clone`, {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({
      data: [fileData, refText, text, languageName(language), false, "1.7B"],
    }),
  });
  if (!start.ok) {
    const detail = await start.text().catch(() => "");
    throw new Error(`Qwen clone job could not start (${start.status}). ${detail.slice(0, 300)}`);
  }
  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) throw new Error("Qwen did not return a clone job ID.");

  const result = await fetch(`${space}/gradio_api/call/generate_voice_clone/${started.event_id}`, {
    headers: authHeaders(env),
  });
  if (!result.ok) {
    const detail = await result.text().catch(() => "");
    throw new Error(`Qwen clone job failed (${result.status}). ${detail.slice(0, 300)}`);
  }

  const stream = await result.text();
  const completeLines = stream
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:") && line.trim() !== "data:");
  if (!completeLines.length) throw new Error("Qwen returned no completed clone audio.");

  let payload: unknown = null;
  for (const line of completeLines.reverse()) {
    try {
      const parsed = JSON.parse(line.slice(5).trim()) as unknown;
      if (Array.isArray(parsed)) {
        payload = parsed;
        break;
      }
    } catch {
      /* keep looking for the completed event */
    }
  }
  if (!Array.isArray(payload) || !payload[0]) throw new Error("Qwen completed without an audio artifact.");

  const audio = payload[0] as { url?: string; path?: string } | string;
  const audioUrl = typeof audio === "string" ? audio : audio.url;
  if (!audioUrl) throw new Error("Qwen returned an audio object without a downloadable URL.");
  return audioUrl.startsWith("http") ? audioUrl : `${space}/gradio_api/file=${audioUrl.replace(/^\//, "")}`;
}

async function handleQwenClone(request: Request, env: Env): Promise<Response> {
  let body: { audioBase64?: string; refText?: string; text?: string; language?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("The clone request was not valid JSON.", 400);
  }

  if (!body.audioBase64) return errorResponse("A reference voice recording is required.", 400);
  if (!body.refText?.trim()) return errorResponse("The exact transcript of the reference recording is required for the high-quality clone mode.", 400);
  if (!body.text?.trim()) return errorResponse("Target text is required.", 400);

  const space = String(env.QWEN_TTS_SPACE_URL || "https://qwen-qwen3-tts.hf.space").replace(/\/$/, "");
  const audio = new Blob([decodeBase64(body.audioBase64)], { type: "audio/wav" });

  try {
    const path = await qwenUpload(space, audio, env);
    const audioUrl = await qwenClone(space, path, body.refText.trim(), body.text.trim(), String(body.language || "English"), env);
    const generated = await fetch(audioUrl, { headers: authHeaders(env) });
    if (!generated.ok || !generated.body) throw new Error(`Qwen generated audio could not be downloaded (${generated.status}).`);
    const headers = new Headers(generated.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-clone-provider", "Qwen3-TTS 1.7B Base");
    headers.set("x-clone-verified", "true");
    return new Response(generated.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Qwen voice cloning failed.", 502);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ai/voice-clone" && request.method === "POST") {
      return handleQwenClone(request, env);
    }
    return studioServer.fetch(request, env, ctx);
  },
};
