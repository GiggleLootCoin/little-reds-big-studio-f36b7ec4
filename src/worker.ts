import studioServer from "./server";

type Env = {
  HF_TOKEN?: string;
};

const CHATTERBOX_SPACE = "https://resembleai-chatterbox.hf.space";
const CLONE_TEXT = "Hi. I'm Buddy. This is my new voice. Let's make something brilliant together.";

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function authHeaders(env: Env): HeadersInit {
  return env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {};
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function uploadReference(audio: Blob, env: Env): Promise<string> {
  const form = new FormData();
  form.append("files", audio, "reference.wav");
  const response = await withTimeout(
    fetch(`${CHATTERBOX_SPACE}/gradio_api/upload`, {
      method: "POST",
      headers: authHeaders(env),
      body: form,
    }),
    30000,
    "Uploading reference voice",
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Chatterbox upload failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  const files = (await response.json()) as unknown;
  if (!Array.isArray(files) || typeof files[0] !== "string") {
    throw new Error("Chatterbox did not return a reference-file path.");
  }
  return files[0];
}

function parseSse(text: string): { event: string; data: unknown }[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim().toLowerCase() || "";
      const raw = block.match(/^data:\s*(.*)$/m)?.[1]?.trim() || "";
      let data: unknown = raw;
      if (raw && raw !== "null") {
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
      }
      return { event, data };
    })
    .filter((item) => item.event || item.data);
}

async function outputAudioUrl(value: unknown): Promise<string> {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        return await outputAudioUrl(item);
      } catch {
        // try next output
      }
    }
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["url", "path"]) {
      if (typeof object[key] === "string") return String(object[key]);
    }
    for (const key of ["data", "value", "output", "result"]) {
      if (object[key] !== undefined) {
        try {
          return await outputAudioUrl(object[key]);
        } catch {
          // try next field
        }
      }
    }
  }
  throw new Error("Chatterbox completed but returned no audio artifact.");
}

async function runChatterboxClone(audio: Blob, text: string, env: Env): Promise<Response> {
  const referencePath = await uploadReference(audio, env);
  const referenceFile = {
    path: referencePath,
    orig_name: "reference.wav",
    meta: { _type: "gradio.FileData" },
  };

  // This is the current ResembleAI/Chatterbox Space contract:
  // text, reference audio, exaggeration, temperature, seed, CFG/Pace, VAD trim.
  const start = await withTimeout(
    fetch(`${CHATTERBOX_SPACE}/gradio_api/call/generate_tts_audio`, {
      method: "POST",
      headers: { ...authHeaders(env), "content-type": "application/json" },
      body: JSON.stringify({
        data: [text.slice(0, 300), referenceFile, 0.5, 0.8, 0, 0.5, false],
      }),
    }),
    30000,
    "Starting Chatterbox clone",
  );
  if (!start.ok) {
    const detail = await start.text().catch(() => "");
    throw new Error(`Chatterbox could not start (${start.status})${detail ? `: ${detail.slice(0, 400)}` : ""}`);
  }
  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) throw new Error("Chatterbox returned no generation ID.");

  const result = await withTimeout(
    fetch(`${CHATTERBOX_SPACE}/gradio_api/call/generate_tts_audio/${encodeURIComponent(started.event_id)}`, {
      headers: authHeaders(env),
    }),
    180000,
    "Chatterbox voice clone generation",
  );
  if (!result.ok) {
    const detail = await result.text().catch(() => "");
    throw new Error(`Chatterbox generation request failed (${result.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`);
  }

  const events = parseSse(await result.text());
  const errorEvent = events.find((item) => item.event === "error");
  if (errorEvent) {
    const message = typeof errorEvent.data === "string" ? errorEvent.data : JSON.stringify(errorEvent.data);
    throw new Error(`Chatterbox generation error: ${message.slice(0, 600)}`);
  }
  const complete = [...events].reverse().find((item) => item.event === "complete");
  if (!complete) throw new Error("Chatterbox ended without completing the voice clone.");

  const artifact = await outputAudioUrl(complete.data);
  const absolute = artifact.startsWith("http")
    ? artifact
    : `${CHATTERBOX_SPACE}/gradio_api/file=${artifact.replace(/^\/+/, "")}`;
  const audio = await withTimeout(fetch(absolute, { headers: authHeaders(env) }), 30000, "Downloading cloned audio");
  if (!audio.ok || !audio.body) {
    const detail = await audio.text().catch(() => "");
    throw new Error(`Chatterbox returned unusable audio (${audio.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  const bytes = Number(audio.headers.get("content-length") || 0);
  if (bytes > 0 && bytes < 4096) throw new Error("Chatterbox returned an unusably small audio file.");
  const headers = new Headers(audio.headers);
  headers.set("content-type", "audio/wav");
  headers.set("cache-control", "no-store");
  headers.set("x-clone-provider", "Chatterbox — Resemble AI");
  headers.set("x-clone-verified", "true");
  return new Response(audio.body, { status: 200, headers });
}

async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  let body: { audioBase64?: string; text?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "The clone request was not valid JSON." }, { status: 400 });
  }
  if (!body.audioBase64) {
    return Response.json({ ok: false, error: "A voice sample is required." }, { status: 400 });
  }
  try {
    const bytes = decodeBase64(body.audioBase64);
    if (bytes.byteLength < 4096) throw new Error("The voice sample is too short or empty.");
    const audio = new Blob([bytes], { type: "audio/wav" });
    const generated = await runChatterboxClone(audio, body.text?.trim() || CLONE_TEXT, env);
    return generated;
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Voice cloning failed." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ai/voice-clone" && request.method === "POST") {
      return handleVoiceClone(request, env);
    }
    return studioServer.fetch(request, env, ctx);
  },
};
