import { canonicalizePcm16Wav, inspectPcm16Wav } from "./audio-artifact";

const BACKEND = "controlled-chatterbox-runtime";
const VERSION = "voice-clone-v10.0-controlled-reference-conditioning";
const DEFAULT_TEXT = "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";
type CloneEnv = { CHATTERBOX_ENDPOINT?: string; CHATTERBOX_TOKEN?: string };
type CloneBody = { audioBase64?: string; audio?: string; refAudio?: string; referenceAudio?: string; audioMimeType?: string; text?: string; target_text?: string; prompt?: string };

function headers() {
  const h = new Headers({ "cache-control": "no-store, no-cache, must-revalidate" });
  h.set("x-buddy-clone-backend", BACKEND);
  h.set("x-buddy-clone-version", VERSION);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-expose-headers", "x-clone-provider,x-clone-verified,x-buddy-clone-backend,x-buddy-clone-version,x-clone-duration,x-clone-peak,x-clone-rms,x-clone-reference-sha256,x-clone-reference-bytes,x-chatterbox-reference-conditioned");
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

async function readInput(request: Request) {
  if ((request.headers.get("content-type") || "").toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = ["audio", "file", "voice", "referenceAudio", "refAudio"].map(k => form.get(k)).find(v => v instanceof File) as File | undefined;
    if (!file?.size) throw new Error("No usable voice sample was uploaded.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, mime: normalizeMime(file.type, file.name), name: file.name || "voice-reference.wav", text: String(form.get("text") || form.get("target_text") || form.get("prompt") || "").trim() };
  }
  let body: CloneBody;
  try { body = await request.json(); } catch { throw new Error("The clone request was not valid JSON or multipart form data."); }
  const encoded = body.audioBase64 || body.audio || body.refAudio || body.referenceAudio;
  if (!encoded) throw new Error("A voice sample is required.");
  const d = decodeBase64(encoded, body.audioMimeType || "audio/wav");
  return { bytes: d.bytes, mime: d.mime, name: "voice-reference.wav", text: (body.text || body.target_text || body.prompt || "").trim() };
}

async function audioResponse(bytes: Uint8Array, provider: string, referenceSha256: string, referenceBytes: number) {
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
  h.set("x-clone-reference-sha256", referenceSha256);
  h.set("x-clone-reference-bytes", String(referenceBytes));
  h.set("x-chatterbox-reference-conditioned", "true");
  return new Response(canonical.buffer.slice(canonical.byteOffset, canonical.byteOffset + canonical.byteLength) as ArrayBuffer, { status: 200, headers: h });
}

async function cloneViaControlledRuntime(input: { bytes: Uint8Array; mime: string; name: string }, text: string, env: CloneEnv, referenceSha256: string) {
  const endpoint = env.CHATTERBOX_ENDPOINT?.trim();
  if (!endpoint) throw new Error("Controlled Chatterbox runtime is not configured. Public fallback is disabled.");
  const form = new FormData();
  const ab = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.append("audio", new Blob([ab], { type: input.mime }), input.name);
  form.append("text", text.slice(0, 300));
  const h: Record<string, string> = {};
  if (env.CHATTERBOX_TOKEN?.trim()) h.Authorization = `Bearer ${env.CHATTERBOX_TOKEN.trim()}`;
  const r = await fetch(endpoint, { method: "POST", headers: h, body: form });
  const conditioned = r.headers.get("x-chatterbox-reference-conditioned") === "true";
  const noFallback = r.headers.get("x-chatterbox-default-fallback") === "false";
  const b = new Uint8Array(await r.arrayBuffer());
  if (!r.ok) throw new Error(`Controlled Chatterbox failed (${r.status}).`);
  if (!conditioned || !noFallback) throw new Error("Controlled Chatterbox did not prove explicit reference conditioning; refusing to return audio.");
  return audioResponse(b, "upstream Chatterbox — controlled free runtime", referenceSha256, input.bytes.byteLength);
}

export function voiceCloneHealth(env?: CloneEnv) {
  const configured = Boolean(env?.CHATTERBOX_ENDPOINT?.trim());
  return Response.json({ ok: configured, capability: "voice-clone", backend: BACKEND, version: VERSION, transcriptRequired: false, primary: "controlled-upstream-chatterbox", publicSpaceFallback: false, configured, outputFormat: "PCM16 WAV", speakerConditioning: { referenceInput: "audio_prompt_path", cfgWeight: 0.3, seed: 42 }, verification: ["reference-byte-hash", "explicit-conditioning-header", "strict-multi-utterance-speaker-gate", "android-playback"] }, { status: configured ? 200 : 503, headers: headers() });
}

export async function handleProductionVoiceClone(request: Request, env: CloneEnv) {
  if (request.method !== "POST") return errorJson("POST required.", 405);
  try {
    const input = await readInput(request);
    if (input.bytes.length < 4096) throw new Error("The voice sample is too short or empty.");
    const referenceSha256 = await sha256(input.bytes);
    const text = input.text || DEFAULT_TEXT;
    return await cloneViaControlledRuntime(input, text, env, referenceSha256);
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : "Voice cloning failed.", 502);
  }
}
