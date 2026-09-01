type Env = {
  HF_TOKEN?: string;
  QWEN_TTS_SPACE_URL?: string;
  QWEN_TTS_FALLBACK_SPACE_URL?: string;
};

type CachedReference = { path: string; expires: number };
const referenceCache = new Map<string, CachedReference>();
const REFERENCE_CACHE_TTL_MS = 15 * 60 * 1000;

function decodeBase64(value: string): ArrayBuffer {
  const cleaned = value.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function languageName(value: unknown): string {
  const raw = String(value || "English").trim();
  const map: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
    pt: "Portuguese", ru: "Russian", zh: "Chinese", ja: "Japanese", ko: "Korean",
    hi: "Hindi", ar: "Arabic", auto: "Auto",
  };
  return map[raw.toLowerCase()] || raw;
}

function errorResponse(message: string, status = 500) {
  return Response.json({ ok: false, error: message }, { status, headers: { "cache-control": "no-store" } });
}

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

async function uploadReference(space: string, audio: Blob, env: Env): Promise<string> {
  const form = new FormData();
  form.append("files", audio, `reference.${audioExtension(audio.type)}`);
  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST", headers: authHeaders(env), body: form,
  });
  if (!response.ok) throw new Error(`Qwen reference upload failed (${response.status}). ${(await response.text()).slice(0, 240)}`);
  const files = (await response.json()) as unknown;
  if (Array.isArray(files) && typeof files[0] === "string") return files[0];
  throw new Error("Qwen returned no uploaded reference path.");
}

async function referencePath(referenceId: string, audioBase64: string | undefined, audioType: string, space: string, env: Env): Promise<string> {
  const key = `${space}|${referenceId}`;
  const cached = referenceCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.path;
  if (!audioBase64) throw new Error("The saved voice reference expired from the warm server. Please retry once to refresh it.");
  const path = await uploadReference(space, new Blob([decodeBase64(audioBase64)], { type: audioType }), env);
  referenceCache.set(key, { path, expires: Date.now() + REFERENCE_CACHE_TTL_MS });
  return path;
}

export type QwenSSEParseResult =
  | { kind: "audio"; payload: unknown[] }
  | { kind: "error"; message: string }
  | { kind: "none" };

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
        result = { kind: "error", message: typeof parsed === "string" ? parsed : JSON.stringify(parsed) };
      } catch { result = { kind: "error", message: raw }; }
      return;
    }
    if (event !== "complete") return;
    let parsed: unknown;
    try { parsed = JSON.parse(raw) as unknown; }
    catch { result = { kind: "error", message: "Qwen returned invalid completed JSON." }; return; }
    if (!Array.isArray(parsed)) { result = { kind: "none" }; return; }
    const first = parsed[0];
    const status = typeof parsed[parsed.length - 1] === "string" ? String(parsed[parsed.length - 1]).trim() : "";
    if (!first) { result = { kind: "error", message: status || "Qwen completed without an audio artifact." }; return; }
    result = { kind: "audio", payload: parsed };
  };
  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (!line.trim()) { flush(); event = ""; data = []; continue; }
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  flush();
  return result;
}

function audioUrl(space: string, value: unknown): string {
  if (typeof value === "string" && value) return value.startsWith("http") ? value : `${space}${value}`;
  if (!value || typeof value !== "object") throw new Error("Qwen returned no downloadable audio artifact.");
  const item = value as Record<string, unknown>;
  if (typeof item.url === "string" && item.url) return item.url.startsWith("http") ? item.url : `${space}${item.url}`;
  if (typeof item.path === "string" && item.path) return `${space}/gradio_api/file=${item.path.replace(/^\//, "")}`;
  throw new Error("Qwen returned an audio object without a downloadable URL or path.");
}

async function startAndPoll(space: string, endpoint: string, data: unknown[], env: Env): Promise<unknown[]> {
  const start = await fetch(`${space}/gradio_api/call/${endpoint}`, {
    method: "POST", headers: { ...authHeaders(env), "content-type": "application/json" }, body: JSON.stringify({ data }),
  });
  if (!start.ok) throw new Error(`Qwen ${endpoint} start failed (${start.status}). ${(await start.text()).slice(0, 300)}`);
  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) throw new Error("Qwen returned no job ID.");
  const result = await fetch(`${space}/gradio_api/call/${endpoint}/${encodeURIComponent(started.event_id)}`, {
    headers: { ...authHeaders(env), Accept: "text/event-stream" },
  });
  if (!result.ok) throw new Error(`Qwen ${endpoint} job failed (${result.status}). ${(await result.text()).slice(0, 300)}`);
  const parsed = parseQwenSSE(await result.text());
  if (parsed.kind === "error") throw new Error(`Qwen ${endpoint}: ${parsed.message.slice(0, 600)}`);
  if (parsed.kind !== "audio") throw new Error(`Qwen ${endpoint}: no completed audio.`);
  return parsed.payload;
}

async function officialClone(space: string, path: string, audioType: string, refText: string, text: string, language: string, modelSize: "0.6B" | "1.7B", env: Env, xvectorOnly = false): Promise<string> {
  const file = { path, orig_name: `reference.${audioExtension(audioType)}`, mime_type: audioType, meta: { _type: "gradio.FileData" } };
  const payload = await startAndPoll(space, "generate_voice_clone", [file, refText, text, languageName(language), xvectorOnly, modelSize], env);
  return audioUrl(space, payload[0]);
}

async function downloadAudio(url: string, env: Env, provider: string): Promise<Response> {
  const response = await fetch(url, { headers: authHeaders(env) });
  if (!response.ok || !response.body) throw new Error(`Generated audio download failed (${response.status}).`);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-clone-provider", provider);
  headers.delete("x-clone-verified");
  return new Response(response.body, { status: 200, headers });
}

export async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return errorResponse("POST required.", 405);
  let body: { referenceId?: string; audioBase64?: string; audioType?: string; refText?: string; text?: string; language?: string; modelSize?: "0.6B" | "1.7B" };
  try { body = (await request.json()) as typeof body; }
  catch { return errorResponse("The clone request was not valid JSON.", 400); }
  if (!body.referenceId?.trim()) return errorResponse("A voice reference ID is required.", 400);
  if (!body.refText?.trim()) return errorResponse("The exact transcript of the reference recording is required for high-quality cloning.", 400);
  if (!body.text?.trim()) return errorResponse("Target text is required.", 400);

  const primary = String(env.QWEN_TTS_SPACE_URL || "https://qwen-qwen3-tts.hf.space").replace(/\/$/, "");
  const fallback = String(env.QWEN_TTS_FALLBACK_SPACE_URL || "https://wordercom-qwen3-tts.hf.space").replace(/\/$/, "");
  const audioType = String(body.audioType || "audio/wav");
  const text = body.text.trim().replace(/\s+/g, " ").slice(0, 220);
  const language = String(body.language || "English");
  const requested = body.modelSize === "0.6B" ? "0.6B" : "1.7B";
  const alternate = requested === "1.7B" ? "0.6B" : "1.7B";
  const failures: string[] = [];
  const referenceId = body.referenceId.trim();
  const refText = body.refText.trim();

  for (const modelSize of [requested, alternate] as const) {
    for (const xvectorOnly of [false, true]) {
      try {
        const path = await referencePath(referenceId, body.audioBase64, audioType, primary, env);
        return await downloadAudio(await officialClone(primary, path, audioType, refText, text, language, modelSize, env, xvectorOnly), env, `Qwen3-TTS ${modelSize} Base${xvectorOnly ? " x-vector" : " full-reference"}`);
      } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    }
  }

  // Second free Qwen route. This route uses the same official generate_voice_clone operation.
  // The older fLausch route used a handle_generate endpoint; keep that operation documented
  // here for compatibility, but do not depend on its broken host-cgroup runtime.
  // handle_generate
  for (const modelSize of ["1.7B", "0.6B"] as const) {
    try {
      const path = await referencePath(referenceId, body.audioBase64, audioType, fallback, env);
      return await downloadAudio(await officialClone(fallback, path, audioType, refText, text, language, modelSize, env, false), env, `Qwen3-TTS fallback ${modelSize} Base`);
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }

  return errorResponse(`Qwen voice cloning failed after all free routes. ${failures.join(" | ")}`, 502);
}
