type Env = {
  HF_TOKEN?: string;
  QWEN_TTS_SPACE_URL?: string;
};

type CachedReference = { path: string; expires: number };
const referenceCache = new Map<string, CachedReference>();
const REFERENCE_CACHE_TTL_MS = 15 * 60 * 1000;

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

function audioExtension(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "audio";
}

async function qwenUpload(space: string, audio: Blob, env: Env): Promise<string> {
  const extension = audioExtension(audio.type);
  const form = new FormData();
  form.append("files", audio, `reference.${extension}`);
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
  if (!Array.isArray(files) || typeof files[0] !== "string")
    throw new Error("Qwen returned no uploaded reference path.");
  return files[0];
}

async function cachedQwenPath(
  referenceId: string,
  audioBase64: string | undefined,
  audioType: string,
  space: string,
  env: Env,
) {
  const now = Date.now();
  const cached = referenceCache.get(referenceId);
  if (cached && cached.expires > now) return { path: cached.path, cacheMiss: false };
  if (cached) referenceCache.delete(referenceId);
  if (!audioBase64)
    throw new Error(
      "The saved voice reference expired from the warm server. Please retry once to refresh it.",
    );
  const audio = new Blob([decodeBase64(audioBase64)], { type: audioType });
  const path = await qwenUpload(space, audio, env);
  referenceCache.set(referenceId, { path, expires: now + REFERENCE_CACHE_TTL_MS });
  return { path, cacheMiss: true };
}

export type QwenSSEParseResult =
  { kind: "audio"; payload: unknown[] } | { kind: "error"; message: string } | { kind: "none" };

export function parseQwenSSE(stream: string): QwenSSEParseResult {
  let currentEvent = "";
  let dataLines: string[] = [];
  let result: QwenSSEParseResult = { kind: "none" };
  const parseFrame = (): boolean => {
    if (!dataLines.length) return false;
    const data = dataLines.join("\n");
    if (currentEvent === "error" || currentEvent === "cancelled") {
      try {
        const parsed = JSON.parse(data) as unknown;
        result = {
          kind: "error",
          message: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
        };
      } catch {
        result = { kind: "error", message: data };
      }
      return true;
    }
    if (currentEvent !== "complete") return false;
    let payload: unknown;
    try {
      payload = JSON.parse(data) as unknown;
    } catch {
      throw new Error("Qwen returned an invalid completed clone result.");
    }
    if (Array.isArray(payload)) {
      const status = payload[1];
      if (!payload[0] && typeof status === "string" && /^Error:\s*/i.test(status.trim())) {
        result = { kind: "error", message: status.trim() };
        return true;
      }
      result = { kind: "audio", payload };
      return true;
    }
    result = { kind: "none" };
    return true;
  };
  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (line.trim() === "") {
      if (parseFrame()) break;
      currentEvent = "";
      dataLines = [];
      continue;
    }
    if (line.startsWith("event:")) currentEvent = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (result.kind === "none") parseFrame();
  return result;
}

async function qwenClone(
  space: string,
  path: string,
  audioType: string,
  refText: string,
  text: string,
  language: string,
  modelSize: "0.6B" | "1.7B",
  env: Env,
): Promise<string> {
  const fileData = {
    path,
    orig_name: `reference.${audioExtension(audioType)}`,
    mime_type: audioType || undefined,
    meta: { _type: "gradio.FileData" },
  };
  const conditioning = {
    ref_audio: fileData,
    ref_text: refText,
    target_text: text,
    language: languageName(language),
    use_xvector_only: false,
    model_size: modelSize,
  };
  const start = await fetch(`${space}/gradio_api/call/generate_voice_clone`, {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({
      data: [
        conditioning.ref_audio,
        conditioning.ref_text,
        conditioning.target_text,
        conditioning.language,
        conditioning.use_xvector_only,
        conditioning.model_size,
      ],
    }),
  });
  if (!start.ok) {
    const detail = await start.text().catch(() => "");
    throw new Error(`Qwen clone job could not start (${start.status}). ${detail.slice(0, 300)}`);
  }
  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) throw new Error("Qwen did not return a clone job ID.");
  const result = await fetch(`${space}/gradio_api/call/generate_voice_clone/${started.event_id}`, {
    headers: { ...authHeaders(env), Accept: "text/event-stream" },
  });
  if (!result.ok) {
    const detail = await result.text().catch(() => "");
    throw new Error(`Qwen clone job failed (${result.status}). ${detail.slice(0, 300)}`);
  }
  const parsed = parseQwenSSE(await result.text());
  if (parsed.kind === "error")
    throw new Error(`Qwen clone job errored: ${parsed.message.slice(0, 500)}`);
  if (parsed.kind !== "audio") throw new Error("Qwen returned no completed clone audio.");
  const audio = parsed.payload[0] as { url?: string; path?: string } | string;
  if (!audio) throw new Error("Qwen completed without an audio artifact.");
  const audioUrl = typeof audio === "string" ? audio : audio.url;
  if (audioUrl) return audioUrl.startsWith("http") ? audioUrl : `${space}${audioUrl}`;
  if (typeof audio !== "string" && audio.path)
    return `${space}/gradio_api/file=${String(audio.path).replace(/^\//, "")}`;
  throw new Error("Qwen returned an audio object without a downloadable URL or path.");
}

export async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  let body: {
    referenceId?: string;
    audioBase64?: string;
    audioType?: string;
    refText?: string;
    text?: string;
    language?: string;
    modelSize?: "0.6B" | "1.7B";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("The clone request was not valid JSON.", 400);
  }
  if (!body.referenceId?.trim()) return errorResponse("A voice reference ID is required.", 400);
  if (!body.refText?.trim())
    return errorResponse(
      "The exact transcript of the reference recording is required for high-quality cloning.",
      400,
    );
  if (!body.text?.trim()) return errorResponse("Target text is required.", 400);

  const space = String(env.QWEN_TTS_SPACE_URL || "https://qwen-qwen3-tts.hf.space").replace(
    /\/$/,
    "",
  );
  const audioType = String(body.audioType || "audio/wav");
  const modelSize = body.modelSize === "1.7B" ? "1.7B" : "0.6B";
  try {
    const cached = await cachedQwenPath(
      body.referenceId.trim(),
      body.audioBase64,
      audioType,
      space,
      env,
    );
    const audioUrl = await qwenClone(
      space,
      cached.path,
      audioType,
      body.refText.trim(),
      body.text.trim().replace(/\s+/g, " ").slice(0, 220),
      String(body.language || "English"),
      modelSize,
      env,
    );
    const generated = await fetch(audioUrl, { headers: authHeaders(env) });
    if (!generated.ok || !generated.body)
      throw new Error(`Qwen generated audio could not be downloaded (${generated.status}).`);
    const headers = new Headers(generated.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-clone-provider", `Qwen3-TTS ${modelSize} Base`);
    headers.delete("x-clone-verified");
    return new Response(generated.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Qwen voice cloning failed.";
    return errorResponse(message, message.includes("expired from the warm server") ? 428 : 502);
  }
}
