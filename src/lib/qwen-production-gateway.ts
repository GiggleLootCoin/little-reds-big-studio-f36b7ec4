type Env = { HF_TOKEN?: string; QWEN_TTS_SPACE_URL?: string };
type ReferenceCache = { path: string; expires: number };
const cache = new Map<string, ReferenceCache>();
const TTL = 15 * 60 * 1000;

const auth = (env: Env): HeadersInit =>
  env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {};

function languageName(value: unknown) {
  const raw = String(value || "English")
    .trim()
    .toLowerCase();
  const names: Record<string, string> = {
    en: "English",
    english: "English",
    es: "Spanish",
    spanish: "Spanish",
    fr: "French",
    french: "French",
    de: "German",
    german: "German",
    it: "Italian",
    italian: "Italian",
    pt: "Portuguese",
    portuguese: "Portuguese",
    ru: "Russian",
    russian: "Russian",
    zh: "Chinese",
    chinese: "Chinese",
    ja: "Japanese",
    japanese: "Japanese",
    ko: "Korean",
    korean: "Korean",
    hi: "Hindi",
    hindi: "Hindi",
    ar: "Arabic",
    arabic: "Arabic",
  };
  return names[raw] || String(value || "English").trim();
}

function ext(type: string) {
  const t = type.toLowerCase();
  if (t.includes("mpeg")) return "mp3";
  if (t.includes("mp4")) return "m4a";
  if (t.includes("webm")) return "webm";
  if (t.includes("ogg")) return "ogg";
  return "wav";
}

function decode(value: string) {
  const raw = value.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}

function error(message: string, status = 502) {
  return Response.json(
    { ok: false, error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function parseProductionQwenSSE(stream: string): { audio?: unknown; error?: string } {
  let event = "";
  let data: string[] = [];
  let audio: unknown;
  let terminalError = "";
  const flush = () => {
    if (!data.length) return;
    const payload = data.join("\n").trim();
    if (event === "error" || event === "cancelled") {
      if (!payload || payload === "null" || payload === "undefined") return;
      try {
        const parsed = JSON.parse(payload) as unknown;
        if (parsed !== null)
          terminalError = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      } catch {
        terminalError = payload;
      }
      return;
    }
    if (event !== "complete") return;
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        const status = typeof parsed[1] === "string" ? parsed[1].trim() : "";
        if (!first && /^Error:/i.test(status)) terminalError = status;
        else if (first) audio = first;
      }
    } catch {
      terminalError = "Qwen returned malformed completion data.";
    }
  };
  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (!line.trim()) {
      flush();
      event = "";
      data = [];
      continue;
    }
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  flush();
  if (audio !== undefined) return { audio };
  return terminalError ? { error: terminalError } : {};
}

async function upload(space: string, bytes: Uint8Array, type: string, env: Env) {
  const form = new FormData();
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  form.append("files", new Blob([buffer], { type }), `reference.${ext(type)}`);
  const r = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    headers: auth(env),
    body: form,
  });
  if (!r.ok)
    throw new Error(
      `Qwen reference upload failed (${r.status}). ${(await r.text()).slice(0, 240)}`,
    );
  const files = (await r.json()) as unknown;
  if (!Array.isArray(files) || typeof files[0] !== "string")
    throw new Error("Qwen returned no uploaded reference path.");
  return files[0];
}

async function referencePath(
  body: { referenceId: string; audioBase64?: string; audioType: string },
  space: string,
  env: Env,
) {
  const now = Date.now();
  const hit = cache.get(body.referenceId);
  if (hit && hit.expires > now) return hit.path;
  if (!body.audioBase64)
    throw new Error(
      "The saved voice reference expired from the warm server. Please retry once to refresh it.",
    );
  const path = await upload(space, decode(body.audioBase64), body.audioType, env);
  cache.set(body.referenceId, { path, expires: now + TTL });
  return path;
}

async function generate(
  space: string,
  path: string,
  body: {
    audioType: string;
    refText: string;
    text: string;
    language?: string;
    modelSize?: "0.6B" | "1.7B";
  },
  env: Env,
) {
  const file = {
    path,
    orig_name: `reference.${ext(body.audioType)}`,
    mime_type: body.audioType,
    meta: { _type: "gradio.FileData" },
  };
  const start = await fetch(`${space}/gradio_api/call/generate_voice_clone`, {
    method: "POST",
    headers: { ...auth(env), "content-type": "application/json" },
    body: JSON.stringify({
      data: [
        file,
        body.refText,
        body.text,
        languageName(body.language),
        false,
        body.modelSize === "0.6B" ? "0.6B" : "1.7B",
      ],
    }),
  });
  if (!start.ok)
    throw new Error(
      `Qwen clone job could not start (${start.status}). ${(await start.text()).slice(0, 300)}`,
    );
  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) throw new Error("Qwen did not return a clone job ID.");
  const result = await fetch(
    `${space}/gradio_api/call/generate_voice_clone/${encodeURIComponent(started.event_id)}`,
    { headers: { ...auth(env), Accept: "text/event-stream" } },
  );
  if (!result.ok)
    throw new Error(
      `Qwen clone job failed (${result.status}). ${(await result.text()).slice(0, 300)}`,
    );
  const parsed = parseProductionQwenSSE(await result.text());
  if (parsed.error) throw new Error(`Qwen clone job errored: ${parsed.error.slice(0, 500)}`);
  if (parsed.audio === undefined) throw new Error("Qwen returned no completed clone audio.");
  const item = parsed.audio;
  const url =
    typeof item === "string"
      ? item
      : item && typeof item === "object"
        ? String((item as Record<string, unknown>).url || "")
        : "";
  const pathValue =
    item && typeof item === "object" ? String((item as Record<string, unknown>).path || "") : "";
  if (url) return url.startsWith("http") ? url : `${space}${url}`;
  if (pathValue) return `${space}/gradio_api/file=${pathValue.replace(/^\//, "")}`;
  throw new Error("Qwen returned an audio artifact without a downloadable URL or path.");
}

export async function handleProductionQwenVoiceClone(request: Request, env: Env) {
  if (request.method !== "POST") return error("POST required.", 405);
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
    return error("The clone request was not valid JSON.", 400);
  }
  if (!body.referenceId?.trim()) return error("A voice reference ID is required.", 400);
  if (!body.refText?.trim())
    return error("The exact transcript of the reference recording is required.", 400);
  if (!body.text?.trim()) return error("Target text is required.", 400);
  const space = String(env.QWEN_TTS_SPACE_URL || "https://qwen-qwen3-tts.hf.space").replace(
    /\/$/,
    "",
  );
  const audioType = String(body.audioType || "audio/wav");
  try {
    const path = await referencePath(
      { referenceId: body.referenceId.trim(), audioBase64: body.audioBase64, audioType },
      space,
      env,
    );
    const url = await generate(
      space,
      path,
      {
        audioType,
        refText: body.refText.trim(),
        text: body.text.trim().replace(/\s+/g, " ").slice(0, 220),
        language: body.language,
        modelSize: body.modelSize,
      },
      env,
    );
    const generated = await fetch(url, { headers: auth(env) });
    if (!generated.ok || !generated.body)
      throw new Error(`Qwen generated audio could not be downloaded (${generated.status}).`);
    const headers = new Headers(generated.headers);
    headers.set("cache-control", "no-store");
    headers.set(
      "x-clone-provider",
      `Qwen3-TTS ${body.modelSize === "0.6B" ? "0.6B" : "1.7B"} Base`,
    );
    headers.delete("x-clone-verified");
    return new Response(generated.body, { status: 200, headers });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Qwen voice cloning failed.");
  }
}
