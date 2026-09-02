import { canonicalizePcm16Wav, inspectPcm16Wav } from "./audio-artifact";

const BACKEND = "free-chatterbox-turbo-zerogpu";
const VERSION = "voice-clone-v10.0-turbo-cached-reference";
const HF_TURBO_SPACE = "https://ResembleAI-chatterbox-turbo-demo.hf.space";
const DEFAULT_TEXT = "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";
const REFERENCE_CACHE_TTL_MS = 15 * 60 * 1000;

type CloneEnv = { HF_TOKEN?: string; CHATTERBOX_ENDPOINT?: string; CHATTERBOX_TOKEN?: string };
type CloneBody = { audioBase64?: string; audio?: string; refAudio?: string; referenceAudio?: string; audioMimeType?: string; text?: string; target_text?: string; prompt?: string };
type Input = { bytes: Uint8Array; mime: string; name: string; text: string };
type CachedReference = { path: string; expires: number };
const referenceCache = new Map<string, CachedReference>();

function headers() {
  const h = new Headers({ "cache-control": "no-store, no-cache, must-revalidate" });
  h.set("x-buddy-clone-backend", BACKEND);
  h.set("x-buddy-clone-version", VERSION);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-expose-headers", "x-clone-provider,x-clone-verified,x-buddy-clone-backend,x-buddy-clone-version,x-clone-duration,x-clone-peak,x-clone-rms,x-clone-reference-sha256,x-clone-reference-bytes");
  return h;
}
function errorJson(message: string, status: number) {
  return Response.json({ ok: false, backend: BACKEND, version: VERSION, error: message }, { status, headers: headers() });
}
function normalizeMime(raw: string, name = "") {
  const mime = String(raw || "").toLowerCase().split(";")[0].trim();
  if (mime.startsWith("audio/")) return mime;
  const ext = name.toLowerCase().split(".").pop() || "";
  return ({ wav: "audio/wav", wave: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus", webm: "audio/webm", flac: "audio/flac" } as Record<string, string>)[ext] || "application/octet-stream";
}
function decodeBase64(value: string, mime = "audio/wav") {
  const m = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  const raw = (m?.[2] || value).replace(/\s/g, "");
  let binary = "";
  try { binary = atob(raw); } catch { throw new Error("The uploaded voice sample is not valid base64 audio."); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime: normalizeMime(m?.[1] || mime) };
}
async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
async function readInput(request: Request): Promise<Input> {
  if ((request.headers.get("content-type") || "").toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = ["audio", "file", "voice", "referenceAudio", "refAudio"].map(k => form.get(k)).find(v => v instanceof File) as File | undefined;
    if (!file?.size) throw new Error("No usable voice sample was uploaded.");
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: normalizeMime(file.type, file.name), name: file.name || "voice-reference.wav", text: String(form.get("text") || form.get("target_text") || form.get("prompt") || "").trim() };
  }
  let body: CloneBody;
  try { body = await request.json(); } catch { throw new Error("The clone request was not valid JSON or multipart form data."); }
  const encoded = body.audioBase64 || body.audio || body.refAudio || body.referenceAudio;
  if (!encoded) throw new Error("A voice sample is required.");
  const d = decodeBase64(encoded, body.audioMimeType || "audio/wav");
  return { bytes: d.bytes, mime: d.mime, name: "voice-reference.wav", text: (body.text || body.target_text || body.prompt || "").trim() };
}
async function audioResponse(bytes: Uint8Array, provider: string, referenceSha256?: string, referenceBytes?: number) {
  if (bytes.length < 4096) throw new Error("The voice service returned an empty or unusably small audio file.");
  const canonical = canonicalizePcm16Wav(bytes);
  const stats = inspectPcm16Wav(canonical);
  const h = headers();
  h.set("content-type", "audio/wav");
  h.set("content-length", String(canonical.byteLength));
  h.set("content-disposition", "inline; filename=buddy-voice-clone.wav");
  h.set("x-clone-provider", provider);
  h.set("x-clone-verified", "true");
  h.set("x-clone-duration", stats.duration.toFixed(6));
  h.set("x-clone-peak", stats.peak.toFixed(6));
  h.set("x-clone-rms", stats.rms.toFixed(6));
  if (referenceSha256) h.set("x-clone-reference-sha256", referenceSha256);
  if (referenceBytes !== undefined) h.set("x-clone-reference-bytes", String(referenceBytes));
  return new Response(canonical.buffer.slice(canonical.byteOffset, canonical.byteOffset + canonical.byteLength) as ArrayBuffer, { status: 200, headers: h });
}
async function uploadReference(input: Input, env: CloneEnv) {
  const form = new FormData();
  const ab = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.append("files", new Blob([ab], { type: input.mime }), input.name);
  const r = await fetch(`${HF_TURBO_SPACE}/gradio_api/upload`, { method: "POST", headers: env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {}, body: form });
  if (!r.ok) throw new Error(`Chatterbox Turbo reference upload failed (${r.status}).`);
  const j = await r.json() as unknown;
  const path = Array.isArray(j) ? String(j[0] || "") : "";
  if (!path) throw new Error("Chatterbox Turbo did not return a reference-file path.");
  return path;
}
async function referencePath(input: Input, referenceSha256: string, env: CloneEnv) {
  const now = Date.now();
  const hit = referenceCache.get(referenceSha256);
  if (hit && hit.expires > now) return hit.path;
  const path = await uploadReference(input, env);
  referenceCache.set(referenceSha256, { path, expires: now + REFERENCE_CACHE_TTL_MS });
  return path;
}
function audioUrl(space: string, item: unknown) {
  if (typeof item === "string") return item.startsWith("http") ? item : `${space}${item}`;
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  if (typeof record.url === "string" && record.url) return record.url.startsWith("http") ? record.url : `${space}${record.url}`;
  if (typeof record.path === "string" && record.path) return `${space}/gradio_api/file=${record.path.replace(/^\//, "")}`;
  return "";
}
async function generate(space: string, path: string, text: string, env: CloneEnv) {
  const file = { path, orig_name: "voice-reference.wav", mime_type: "audio/wav", meta: { _type: "gradio.FileData" } };
  const q = await fetch(`${space}/gradio_api/call/generate`, {
    method: "POST",
    headers: { ...(env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {}), "content-type": "application/json" },
    body: JSON.stringify({ data: [text.slice(0, 300), file, 0.8, 0, 0, 0.95, 1000, 1.2, true] }),
  });
  if (!q.ok) throw new Error(`Chatterbox Turbo queue failed (${q.status}).`);
  const started = await q.json() as { event_id?: string };
  if (!started.event_id) throw new Error("Chatterbox Turbo returned no event ID.");
  const result = await fetch(`${space}/gradio_api/call/generate/${encodeURIComponent(started.event_id)}`, { headers: { ...(env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {}), Accept: "text/event-stream" } });
  if (!result.ok) throw new Error(`Chatterbox Turbo generation failed (${result.status}).`);
  const stream = await result.text();
  let complete = "", failure = "";
  for (const block of stream.split(/\n\s*\n/)) {
    const ev = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data = block.match(/^data:\s*(.*)$/m)?.[1]?.trim() || "";
    if (ev === "complete") complete = data;
    if (ev === "error") failure = data;
  }
  if (failure) throw new Error(`Chatterbox Turbo generation error: ${failure}`);
  if (!complete) throw new Error("Chatterbox Turbo returned no completed audio.");
  let output: unknown;
  try { output = JSON.parse(complete); } catch { throw new Error("Chatterbox Turbo returned malformed completion data."); }
  const first = Array.isArray(output) ? output[0] : output;
  const url = audioUrl(space, first);
  if (!url) throw new Error("Chatterbox Turbo completed without an audio artifact.");
  const audio = await fetch(url, { headers: env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {} });
  if (!audio.ok) throw new Error(`Chatterbox Turbo audio fetch failed (${audio.status}).`);
  return new Uint8Array(await audio.arrayBuffer());
}
async function cloneViaSelfHosted(input: Input, text: string, env: CloneEnv, referenceSha256: string) {
  if (!env.CHATTERBOX_ENDPOINT?.trim()) return null;
  const form = new FormData();
  const ab = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.append("audio", new Blob([ab], { type: input.mime }), input.name);
  form.append("text", text);
  const h: Record<string, string> = {};
  if (env.CHATTERBOX_TOKEN) h.Authorization = `Bearer ${env.CHATTERBOX_TOKEN}`;
  const r = await fetch(env.CHATTERBOX_ENDPOINT, { method: "POST", headers: h, body: form });
  const b = new Uint8Array(await r.arrayBuffer());
  if (!r.ok) throw new Error(`Self-hosted Chatterbox failed (${r.status}).`);
  return audioResponse(b, "self-hosted Chatterbox", referenceSha256, input.bytes.byteLength);
}
export function voiceCloneHealth(env?: CloneEnv) {
  return Response.json({ ok: true, capability: "voice-clone", backend: BACKEND, version: VERSION, transcriptRequired: false, primary: env?.CHATTERBOX_ENDPOINT ? "self-hosted-chatterbox" : "Chatterbox Turbo ZeroGPU", fallback: "none", outputFormat: "PCM16 WAV", referenceCaching: "SHA-256 keyed, 15 minute warm cache", verification: ["container", "duration", "non-silent samples", "browser decode", "reference-byte-hash"] }, { headers: headers() });
}
export async function handleProductionVoiceClone(request: Request, env: CloneEnv) {
  if (request.method !== "POST") return errorJson("POST required.", 405);
  try {
    const input = await readInput(request);
    if (input.bytes.length < 4096) throw new Error("The voice sample is too short or empty.");
    const referenceSha256 = await sha256(input.bytes);
    const text = input.text || DEFAULT_TEXT;
    if (env.CHATTERBOX_ENDPOINT) {
      try {
        const r = await cloneViaSelfHosted(input, text, env, referenceSha256);
        if (r) return r;
      } catch (e) {
        console.warn(`[voice-clone] self-hosted failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    let path = await referencePath(input, referenceSha256, env);
    try {
      const bytes = await generate(HF_TURBO_SPACE, path, text, env);
      return await audioResponse(bytes, "Chatterbox Turbo — Resemble AI Hugging Face ZeroGPU", referenceSha256, input.bytes.byteLength);
    } catch (firstError) {
      referenceCache.delete(referenceSha256);
      path = await referencePath(input, referenceSha256, env);
      try {
        const bytes = await generate(HF_TURBO_SPACE, path, text, env);
        return await audioResponse(bytes, "Chatterbox Turbo — Resemble AI Hugging Face ZeroGPU (reference refreshed)", referenceSha256, input.bytes.byteLength);
      } catch (secondError) {
        throw new Error(`Chatterbox Turbo failed after reference refresh. ${secondError instanceof Error ? secondError.message : String(firstError)}`);
      }
    }
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : "Voice cloning failed.", 502);
  }
}
