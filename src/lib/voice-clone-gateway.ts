type Env = { HF_TOKEN?: string; VOXCPM_SPACE_URL?: string };

type Body = {
  referenceId?: string;
  audioBase64?: string;
  audioType?: string;
  refText?: string;
  text?: string;
  language?: string;
  modelSize?: "0.6B" | "1.7B";
};

export const RED_VOICE_PROVIDER = "VoxCPM2 reference clone";
const PRIMARY_SPACE = "https://openbmb-voxcpm-demo.hf.space";
const REFERENCE_CACHE_TTL_MS = 15 * 60_000;
const VOXCPM_INFERENCE_TIMESTEPS = 10;
const VOXCPM_QUEUE_RETRY_DELAYS_MS = [1500, 4000, 8000];
const cache = new Map<string, { path: string; expires: number }>();

function primarySpace(env: Env) {
  return (env.VOXCPM_SPACE_URL?.trim() || PRIMARY_SPACE).replace(/\/$/, "");
}

function auth(env: Env): HeadersInit {
  return env.HF_TOKEN?.trim() ? { Authorization: `Bearer ${env.HF_TOKEN.trim()}` } : {};
}

function ext(type: string) {
  const t = type.toLowerCase();
  if (t.includes("webm")) return "webm";
  if (t.includes("mpeg")) return "mp3";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("flac")) return "flac";
  return "wav";
}

function decode(value: string) {
  const s = value.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  let binary: string;
  try {
    binary = atob(s);
  } catch {
    throw new Error("The Red voice reference is not valid base64 audio.");
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function upload(space: string, id: string, base64: string, type: string, env: Env, refresh = false) {
  const key = `${space}|${id}`;
  const old = cache.get(key);
  if (!refresh && old && old.expires > Date.now()) return old.path;

  const form = new FormData();
  form.append("files", new Blob([decode(base64)], { type }), `red-reference.${ext(type)}`);
  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    headers: auth(env),
    body: form,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`VoxCPM reference upload failed (${response.status}). ${detail}`.trim());
  }
  const payload = (await response.json()) as unknown;
  const path = Array.isArray(payload) ? String(payload[0] || "") : "";
  if (!path) throw new Error("VoxCPM returned no reference-file path.");
  cache.set(key, { path, expires: Date.now() + REFERENCE_CACHE_TTL_MS });
  return path;
}

export type VoxCPMSSEParseResult =
  | { kind: "audio"; payload: unknown[] }
  | { kind: "error"; message: string }
  | { kind: "none" };

export function parseVoxCPMSSE(stream: string): VoxCPMSSEParseResult {
  let event = "";
  let data: string[] = [];
  let result: VoxCPMSSEParseResult = { kind: "none" };
  const flush = () => {
    if (!data.length) return;
    const raw = data.join("\n").trim();
    if (!raw) return;
    if (event === "error" || event === "cancelled") {
      try {
        const payload = JSON.parse(raw) as unknown;
        result = { kind: "error", message: typeof payload === "string" ? payload : JSON.stringify(payload) };
      } catch {
        result = { kind: "error", message: raw };
      }
      return;
    }
    if (event !== "complete") return;
    try {
      const payload = JSON.parse(raw) as unknown;
      if (Array.isArray(payload) && payload.length > 0) {
        if (payload[0] == null && typeof payload[1] === "string" && payload[1].trim())
          result = { kind: "error", message: payload[1].trim() };
        else result = { kind: "audio", payload };
      }
    } catch {
      result = { kind: "error", message: "VoxCPM returned invalid completed JSON." };
    }
  };
  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (!line.trim()) {
      flush();
      event = "";
      data = [];
    } else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  flush();
  return result;
}

function fileData(path: string, type: string) {
  return { path, orig_name: `red-reference.${ext(type)}`, mime_type: type, meta: { _type: "gradio.FileData" } };
}

function toWav(value: unknown): ArrayBuffer | null {
  if (!Array.isArray(value) || typeof value[0] !== "number" || !Array.isArray(value[1]) || value[1].length === 0) return null;
  const sampleRate = Math.round(value[0]);
  const samples = value[1] as unknown[];
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const n = Math.max(-1, Math.min(1, Number(samples[i]) || 0));
    pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
  }
  const output = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(output);
  const put = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  put(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); put(8, "WAVE"); put(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); put(36, "data"); view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(output, 44).set(new Uint8Array(pcm.buffer));
  return output;
}

function isQueueFullError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /queue is full|max size is \d+ and size is \d+/i.test(message);
}

async function wait(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function generate(space: string, path: string, type: string, body: Body, env: Env): Promise<Response> {
  const refText = body.refText?.trim() || "";
  const targetText = body.text?.trim().replace(/\s+/g, " ").slice(0, 220) || "";
  if (!targetText) throw new Error("Target text is required.");
  const start = await fetch(`${space}/gradio_api/call/generate`, {
    method: "POST",
    headers: { ...auth(env), "content-type": "application/json" },
    body: JSON.stringify({
      data: [
        targetText,
        "",
        fileData(path, type),
        Boolean(refText),
        refText,
        2.0,
        true,
        false,
        VOXCPM_INFERENCE_TIMESTEPS,
      ],
    }),
  });
  if (!start.ok) {
    const detail = (await start.text().catch(() => "")).slice(0, 300);
    throw new Error(`VoxCPM clone start failed (${start.status}). ${detail}`.trim());
  }
  const job = (await start.json()) as { event_id?: string };
  if (!job.event_id) throw new Error("VoxCPM returned no clone job ID.");
  const result = await fetch(`${space}/gradio_api/call/generate/${encodeURIComponent(job.event_id)}`, { headers: { ...auth(env), Accept: "text/event-stream" } });
  if (!result.ok) {
    const detail = (await result.text().catch(() => "")).slice(0, 300);
    throw new Error(`VoxCPM clone job failed (${result.status}). ${detail}`.trim());
  }
  const parsed = parseVoxCPMSSE(await result.text());
  if (parsed.kind === "error") throw new Error(`VoxCPM clone: ${parsed.message.slice(0, 500)}`);
  if (parsed.kind !== "audio") throw new Error("VoxCPM completed without cloned audio.");
  const wav = toWav(parsed.payload[0]);
  const provider = RED_VOICE_PROVIDER;
  if (wav)
    return new Response(wav, { status: 200, headers: { "content-type": "audio/wav", "cache-control": "no-store", "x-clone-provider": provider, "x-red-voice-route": "voxcpm2-reference-clone" } });
  const first = parsed.payload[0];
  const item = first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  const artifact = typeof first === "string" ? first : item && typeof item.url === "string" ? item.url : item && typeof item.path === "string" ? `${space}/gradio_api/file=${String(item.path).replace(/^\//, "")}` : "";
  if (!artifact) throw new Error("VoxCPM returned no playable cloned audio artifact.");
  const audio = await fetch(artifact.startsWith("http") ? artifact : `${space}${artifact}`, { headers: auth(env) });
  if (!audio.ok || !audio.body) throw new Error(`VoxCPM audio download failed (${audio.status}).`);
  const headers = new Headers(audio.headers);
  headers.set("cache-control", "no-store"); headers.set("x-clone-provider", provider); headers.set("x-red-voice-route", "voxcpm2-reference-clone");
  return new Response(audio.body, { status: 200, headers });
}

async function generateFromSpace(space: string, body: Body, env: Env): Promise<Response> {
  const id = body.referenceId!.trim();
  const type = String(body.audioType || "audio/wav");
  const path = await upload(space, id, body.audioBase64!, type, env);
  return generate(space, path, type, body, env);
}

async function generateWithQueueRetry(space: string, body: Body, env: Env): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= VOXCPM_QUEUE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await generateFromSpace(space, body, env);
    } catch (error) {
      lastError = error;
      if (!isQueueFullError(error) || attempt === VOXCPM_QUEUE_RETRY_DELAYS_MS.length) throw error;
      const delay = VOXCPM_QUEUE_RETRY_DELAYS_MS[attempt];
      console.warn(`[voice-clone] VoxCPM queue full; retrying same cached Red reference in ${delay}ms (attempt ${attempt + 2}).`);
      await wait(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function handleVoiceClone(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/api/voice-clone" && path !== "/api/ai/voice-clone") return null;
  if (request.method !== "POST") return Response.json({ ok: false, error: "POST required." }, { status: 405 });
  let body: Body;
  try { body = (await request.json()) as Body; } catch { return Response.json({ ok: false, error: "The clone request was not valid JSON." }, { status: 400 }); }
  if (!body.referenceId?.trim() || !body.audioBase64) return Response.json({ ok: false, error: "A Red voice reference is required." }, { status: 400 });
  if (!body.text?.trim()) return Response.json({ ok: false, error: "Target text is required." }, { status: 400 });
  const space = primarySpace(env);
  try {
    return await generateWithQueueRetry(space, body, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const queueFull = isQueueFullError(error);
    console.warn(`[voice-clone] ${space} failed: ${message}`);
    return Response.json(
      { ok: false, error: `Red voice cloning is temporarily unavailable on the verified VoxCPM2 reference-clone route. ${message}` },
      { status: queueFull ? 503 : 502, headers: { "cache-control": "no-store", "x-red-voice-route": "voxcpm2-reference-clone", ...(queueFull ? { "retry-after": "10" } : {}) } },
    );
  }
}
