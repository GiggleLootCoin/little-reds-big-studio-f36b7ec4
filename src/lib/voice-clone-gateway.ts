type Env = {
  HF_TOKEN?: string;
  QWEN_TTS_SPACE_URL?: string;
  QWEN_TTS_FALLBACK_SPACE_URL?: string;
};

type CachedReference = { path: string; expires: number };
const referenceCache = new Map<string, CachedReference>();
const REFERENCE_CACHE_TTL_MS = 15 * 60 * 1000;

function authHeaders(env: Env): HeadersInit {
  return env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {};
}

function audioExtension(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "audio";
}

function decodeBase64(value: string): ArrayBuffer {
  const cleaned = value.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function uploadReference(space: string, audio: Blob, env: Env): Promise<string> {
  const form = new FormData();
  form.append("files", audio, `reference.${audioExtension(audio.type)}`);
  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    headers: authHeaders(env),
    body: form,
  });
  if (!response.ok) throw new Error(`Reference upload failed (${response.status}).`);
  const files = (await response.json()) as unknown;
  if (Array.isArray(files) && typeof files[0] === "string") return files[0];
  throw new Error("Provider returned no uploaded reference path.");
}

async function referencePath(
  referenceId: string,
  audioBase64: string | undefined,
  audioType: string,
  space: string,
  env: Env,
  forceRefresh = false,
): Promise<string> {
  const key = `${space}|${referenceId}`;
  if (!forceRefresh) {
    const cached = referenceCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.path;
  } else referenceCache.delete(key);
  if (!audioBase64) throw new Error("REFERENCE_REFRESH_REQUIRED");
  const path = await uploadReference(
    space,
    new Blob([decodeBase64(audioBase64)], { type: audioType }),
    env,
  );
  referenceCache.set(key, { path, expires: Date.now() + REFERENCE_CACHE_TTL_MS });
  return path;
}

export type QwenSSEParseResult =
  { kind: "audio"; payload: unknown[] } | { kind: "error"; message: string } | { kind: "none" };

export function parseQwenSSE(stream: string): QwenSSEParseResult {
  let event = "";
  let data: string[] = [];
  let result: QwenSSEParseResult = { kind: "none" };
  const flush = () => {
    if (!data.length) return;
    const raw = data.join("\n").trim();
    if (!raw) return;
    if (event === "error" || event === "cancelled") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        result = {
          kind: "error",
          message: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
        };
      } catch {
        result = { kind: "error", message: raw };
      }
      return;
    }
    if (event !== "complete") return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const first = parsed[0];
      if (!first) {
        result = { kind: "error", message: "Provider completed without an audio artifact." };
        return;
      }
      result = { kind: "audio", payload: parsed };
    } catch {
      result = { kind: "error", message: "Provider returned invalid completed JSON." };
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
  return result;
}

async function startAndPoll(
  space: string,
  endpoint: string,
  data: unknown[],
  env: Env,
): Promise<unknown[]> {
  const start = await fetch(`${space}/gradio_api/call/${endpoint}`, {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!start.ok) throw new Error(`${endpoint} start failed (${start.status}).`);
  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) throw new Error("Provider returned no job ID.");
  const result = await fetch(
    `${space}/gradio_api/call/${endpoint}/${encodeURIComponent(started.event_id)}`,
    { headers: { ...authHeaders(env), Accept: "text/event-stream" } },
  );
  if (!result.ok) throw new Error(`${endpoint} job failed (${result.status}).`);
  const parsed = parseQwenSSE(await result.text());
  if (parsed.kind === "error") throw new Error(`${endpoint}: ${parsed.message.slice(0, 600)}`);
  if (parsed.kind !== "audio") throw new Error(`${endpoint}: no completed audio.`);
  return parsed.payload;
}

function fileData(path: string, audioType: string) {
  return {
    path,
    orig_name: `reference.${audioExtension(audioType)}`,
    mime_type: audioType,
    meta: { _type: "gradio.FileData" },
  };
}

function wavFromTuple(value: unknown): ArrayBuffer | null {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== "number") return null;
  const sampleRate = value[0];
  const samples = value[1];
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Array.isArray(samples) || !samples.length)
    return null;
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const n = Math.max(-1, Math.min(1, Number(samples[i]) || 0));
    pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate * 2), true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
  return buffer;
}

async function downloadAudio(url: string, env: Env, provider: string): Promise<Response> {
  const response = await fetch(url, { headers: authHeaders(env) });
  if (!response.ok || !response.body)
    throw new Error(`Generated audio download failed (${response.status}).`);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-clone-provider", provider);
  headers.set("x-red-voice-route", "verified-reference-clone");
  return new Response(response.body, { status: 200, headers });
}

async function turboClone(
  space: string,
  path: string,
  audioType: string,
  text: string,
  env: Env,
): Promise<Response> {
  const payload = await startAndPoll(
    space,
    "generate",
    [text, fileData(path, audioType), 0.8, 0, 0, 0.95, 1000, 1.2, true],
    env,
  );
  const wav = wavFromTuple(payload[0]);
  if (wav) {
    return new Response(wav, {
      headers: {
        "content-type": "audio/wav",
        "cache-control": "no-store",
        "x-clone-provider": "Chatterbox Turbo reference clone",
        "x-red-voice-route": "verified-reference-clone",
      },
    });
  }
  const first = payload[0];
  const url =
    typeof first === "string"
      ? first
      : first &&
          typeof first === "object" &&
          typeof (first as Record<string, unknown>).url === "string"
        ? String((first as Record<string, unknown>).url)
        : null;
  if (!url) throw new Error("Chatterbox Turbo returned no playable audio artifact.");
  return downloadAudio(
    url.startsWith("http") ? url : `${space}${url}`,
    env,
    "Chatterbox Turbo reference clone",
  );
}

async function officialClone(
  space: string,
  path: string,
  audioType: string,
  refText: string,
  text: string,
  language: string,
  env: Env,
): Promise<string> {
  const payload = await startAndPoll(
    space,
    "generate_voice_clone",
    [fileData(path, audioType), refText, text, language, !refText, "1.7B"],
    env,
  );
  const first = payload[0];
  if (typeof first === "string") return first.startsWith("http") ? first : `${space}${first}`;
  if (first && typeof first === "object") {
    const item = first as Record<string, unknown>;
    if (typeof item.url === "string")
      return item.url.startsWith("http") ? item.url : `${space}${item.url}`;
    if (typeof item.path === "string")
      return `${space}/gradio_api/file=${item.path.replace(/^\//, "")}`;
  }
  throw new Error("Qwen returned no playable cloned audio.");
}

async function cloneWithRefresh(
  space: string,
  referenceId: string,
  audioBase64: string | undefined,
  audioType: string,
  clone: (path: string) => Promise<string | Response>,
): Promise<string | Response> {
  let path = await referencePath(referenceId, audioBase64, audioType, space, envGlobal);
  try {
    return await clone(path);
  } catch (firstError) {
    if (!audioBase64) throw firstError;
    path = await referencePath(referenceId, audioBase64, audioType, space, envGlobal, true);
    return await clone(path);
  }
}

let envGlobal: Env = {};

export async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  envGlobal = env;
  if (request.method !== "POST")
    return Response.json({ ok: false, error: "POST required." }, { status: 405 });
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
    return Response.json(
      { ok: false, error: "The clone request was not valid JSON." },
      { status: 400 },
    );
  }
  if (!body.referenceId?.trim())
    return Response.json(
      { ok: false, error: "A voice reference ID is required." },
      { status: 400 },
    );
  if (!body.text?.trim())
    return Response.json({ ok: false, error: "Target text is required." }, { status: 400 });

  const turbo = "https://oicui-chatterbox-turbo-demo.hf.space";
  const primary = String(env.QWEN_TTS_SPACE_URL || "https://qwen-qwen3-tts.hf.space").replace(
    /\/$/,
    "",
  );
  const fallback = String(
    env.QWEN_TTS_FALLBACK_SPACE_URL || "https://wordercom-qwen3-tts.hf.space",
  ).replace(/\/$/, "");
  const audioType = String(body.audioType || "audio/wav");
  const text = body.text.trim().replace(/\s+/g, " ").slice(0, 220);
  const referenceId = body.referenceId.trim();
  const refText = body.refText?.trim() || "";
  const xvectorOnly = !refText;
  const failures: string[] = [];

  if (xvectorOnly) {
    try {
      const result = await cloneWithRefresh(
        turbo,
        referenceId,
        body.audioBase64,
        audioType,
        (path) => turboClone(turbo, path, audioType, text, env),
      );
      if (result instanceof Response) return result;
      return downloadAudio(result, env, "Chatterbox Turbo reference clone");
    } catch (error) {
      failures.push(`Turbo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const [label, space] of [
    ["Qwen", primary],
    ["Qwen fallback", fallback],
  ] as const) {
    try {
      const result = await cloneWithRefresh(
        space,
        referenceId,
        body.audioBase64,
        audioType,
        (path) =>
          officialClone(
            space,
            path,
            audioType,
            refText,
            text,
            String(body.language || "English"),
            env,
          ),
      );
      if (result instanceof Response) return result;
      return downloadAudio(
        result,
        env,
        `${label} ${xvectorOnly ? "speaker-embedding" : "full-reference"} clone`,
      );
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!xvectorOnly) {
    try {
      const result = await cloneWithRefresh(
        turbo,
        referenceId,
        body.audioBase64,
        audioType,
        (path) => turboClone(turbo, path, audioType, text, env),
      );
      if (result instanceof Response) return result;
      return downloadAudio(result, env, "Chatterbox Turbo reference clone");
    } catch (error) {
      failures.push(`Turbo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const refreshOnly =
    failures.length > 0 && failures.every((x) => x.includes("REFERENCE_REFRESH_REQUIRED"));
  return Response.json(
    {
      ok: false,
      error: refreshOnly
        ? "The saved voice reference expired from the warm server. Please retry once to refresh it."
        : `Voice cloning failed without using the generic/demo Chatterbox route. ${failures.join(" | ")}`,
    },
    { status: refreshOnly ? 428 : 502, headers: { "cache-control": "no-store" } },
  );
}
