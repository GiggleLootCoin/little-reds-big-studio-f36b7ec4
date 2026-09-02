import { handleVoiceClone } from "./voice-clone-gateway";

type CloneEnv = {
  HF_TOKEN?: string;
  QWEN_TTS_SPACE_URL?: string;
};

const BACKEND = "qwen3-reference-clone";
const VERSION = "voice-clone-qwen3-reference-v1";

function headers() {
  const h = new Headers({
    "cache-control": "no-store, no-cache, must-revalidate",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "x-clone-provider,x-red-voice-route",
    "x-buddy-clone-backend": BACKEND,
    "x-buddy-clone-version": VERSION,
  });
  return h;
}

function errorJson(message: string, status: number) {
  return Response.json(
    { ok: false, backend: BACKEND, version: VERSION, error: message },
    { status, headers: headers() },
  );
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function sha256(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function multipartToGateway(request: Request, env: CloneEnv) {
  const form = await request.formData();
  const file = ["audio", "file", "voice", "referenceAudio", "refAudio"]
    .map((key) => form.get(key))
    .find((value): value is File => value instanceof File);
  if (!file?.size) throw new Error("No usable Red voice reference was uploaded.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = String(form.get("text") || form.get("target_text") || form.get("prompt") || "").trim();
  if (!text) throw new Error("Target text is required.");

  const body = {
    referenceId: await sha256(bytes),
    audioBase64: toBase64(bytes),
    audioType: file.type || "audio/wav",
    text,
    language: String(form.get("language") || "English"),
    modelSize: String(form.get("modelSize") || "0.6B") === "1.7B" ? "1.7B" : "0.6B",
    refText: String(form.get("refText") || form.get("referenceTranscript") || "").trim(),
  };

  return handleVoiceClone(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

export function voiceCloneHealth(_env?: CloneEnv) {
  return Response.json(
    {
      ok: true,
      capability: "voice-clone",
      backend: BACKEND,
      version: VERSION,
      transcriptRequired: false,
      primary: "official Qwen3-TTS Voice Clone Base",
      fallback: "Wordercom Qwen3-TTS Voice Clone",
      outputFormat: "PCM16 WAV",
      verification: ["reference upload", "Qwen clone provider header", "non-empty audio", "browser playback"],
    },
    { headers: headers() },
  );
}

export async function handleProductionVoiceClone(request: Request, env: CloneEnv) {
  if (request.method !== "POST") return errorJson("POST required.", 405);

  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) return await multipartToGateway(request, env);
    return await handleVoiceClone(request, env);
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Voice cloning failed.", 502);
  }
}
