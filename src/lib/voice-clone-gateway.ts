type Env = { HF_TOKEN?: string; QWEN_TTS_SPACE_URL?: string };

type Body = {
  referenceId?: string;
  audioBase64?: string;
  audioType?: string;
  refText?: string;
  text?: string;
  language?: string;
  modelSize?: "0.6B" | "1.7B";
};

const DEFAULT_SPACE = "https://qwen-qwen3-tts.hf.space";
const cache = new Map<string, { path: string; expires: number }>();

function spaceUrl(env: Env) {
  return (env.QWEN_TTS_SPACE_URL?.trim() || DEFAULT_SPACE).replace(/\/$/, "");
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

async function upload(
  space: string,
  id: string,
  base64: string,
  type: string,
  env: Env,
  refresh = false,
) {
  const key = `${space}|${id}`;
  const old = cache.get(key);
  if (!refresh && old && old.expires > Date.now()) return old.path;

  const form = new FormData();
  form.append(
    "files",
    new Blob([decode(base64)], { type }),
    `red-reference.${ext(type)}`,
  );

  const response = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    headers: auth(env),
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Qwen reference upload failed (${response.status}).`);
  }

  const payload = (await response.json()) as unknown;
  const path = Array.isArray(payload) ? String(payload[0] || "") : "";
  if (!path) throw new Error("Qwen returned no reference-file path.");

  cache.set(key, { path, expires: Date.now() + 15 * 60_000 });
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
        const payload = JSON.parse(raw) as unknown;
        result = {
          kind: "error",
          message: typeof payload === "string" ? payload : JSON.stringify(payload),
        };
      } catch {
        result = { kind: "error", message: raw };
      }
      return;
    }

    if (event !== "complete") return;
    try {
      const payload = JSON.parse(raw) as unknown;
      if (Array.isArray(payload) && payload.length > 0) {
        result = { kind: "audio", payload };
      }
    } catch {
      result = { kind: "error", message: "Qwen returned invalid completed JSON." };
    }
  };

  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (!line.trim()) {
      flush();
      event = "";
      data = [];
    } else if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }
  flush();
  return result;
}

function fileData(path: string, type: string) {
  return {
    path,
    orig_name: `red-reference.${ext(type)}`,
    mime_type: type,
    meta: { _type: "gradio.FileData" },
  };
}

function toWav(value: unknown): ArrayBuffer | null {
  if (
    !Array.isArray(value) ||
    typeof value[0] !== "number" ||
    !Array.isArray(value[1]) ||
    value[1].length === 0
  ) {
    return null;
  }

  const sampleRate = Math.round(value[0]);
  const samples = value[1] as unknown[];
  const pcm = new Int16Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const n = Math.max(-1, Math.min(1, Number(samples[i]) || 0));
    pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
  }

  const output = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(output);
  const put = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  put(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  put(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(output, 44).set(new Uint8Array(pcm.buffer));
  return output;
}

async function generate(
  space: string,
  path: string,
  type: string,
  body: Body,
  env: Env,
): Promise<Response> {
  const refText = body.refText?.trim() || "";
  const targetText = body.text?.trim().replace(/\s+/g, " ").slice(0, 220) || "";
  const modelSize = body.modelSize === "1.7B" ? "1.7B" : "0.6B";
  if (!targetText) throw new Error("Target text is required.");

  const start = await fetch(`${space}/gradio_api/call/generate_voice_clone`, {
    method: "POST",
    headers: { ...auth(env), "content-type": "application/json" },
    body: JSON.stringify({
      data: [
        fileData(path, type),
        refText,
        targetText,
        body.language || "English",
        !refText,
        modelSize,
      ],
    }),
  });
  if (!start.ok) {
    throw new Error(`Qwen voice clone start failed (${start.status}).`);
  }

  const job = (await start.json()) as { event_id?: string };
  if (!job.event_id) throw new Error("Qwen returned no voice-clone job ID.");

  const result = await fetch(
    `${space}/gradio_api/call/generate_voice_clone/${encodeURIComponent(job.event_id)}`,
    { headers: { ...auth(env), Accept: "text/event-stream" } },
  );
  if (!result.ok) throw new Error(`Qwen voice clone job failed (${result.status}).`);

  const parsed = parseQwenSSE(await result.text());
  if (parsed.kind === "error") {
    throw new Error(`Qwen voice clone: ${parsed.message.slice(0, 500)}`);
  }
  if (parsed.kind !== "audio") throw new Error("Qwen completed without cloned audio.");

  const wav = toWav(parsed.payload[0]);
  const provider = `Qwen3-TTS Base ${modelSize} reference clone`;
  if (wav) {
    return new Response(wav, {
      status: 200,
      headers: {
        "content-type": "audio/wav",
        "cache-control": "no-store",
        "x-clone-provider": provider,
        "x-red-voice-route": "qwen3-reference-clone",
      },
    });
  }

  const first = parsed.payload[0];
  const item = first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  const artifact =
    typeof first === "string"
      ? first
      : item && typeof item.url === "string"
        ? item.url
        : item && typeof item.path === "string"
          ? `${space}/gradio_api/file=${String(item.path).replace(/^\//, "")}`
          : "";
  if (!artifact) throw new Error("Qwen returned no playable cloned audio artifact.");

  const audio = await fetch(artifact.startsWith("http") ? artifact : `${space}${artifact}`, {
    headers: auth(env),
  });
  if (!audio.ok || !audio.body) {
    throw new Error(`Qwen audio download failed (${audio.status}).`);
  }

  const headers = new Headers(audio.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-clone-provider", provider);
  headers.set("x-red-voice-route", "qwen3-reference-clone");
  return new Response(audio.body, { status: 200, headers });
}

export async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "POST required." }, { status: 405 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json(
      { ok: false, error: "The clone request was not valid JSON." },
      { status: 400 },
    );
  }

  if (!body.referenceId?.trim() || !body.audioBase64) {
    return Response.json({ ok: false, error: "A Red voice reference is required." }, { status: 400 });
  }
  if (!body.text?.trim()) {
    return Response.json({ ok: false, error: "Target text is required." }, { status: 400 });
  }

  const type = String(body.audioType || "audio/wav");
  const id = body.referenceId.trim();
  const space = spaceUrl(env);

  try {
    let path = await upload(space, id, body.audioBase64, type, env);
    try {
      return await generate(space, path, type, body, env);
    } catch (firstError) {
      console.warn(
        `[voice-clone] Qwen generation failed; refreshing reference upload: ${
          firstError instanceof Error ? firstError.message : String(firstError)
        }`,
      );
      path = await upload(space, id, body.audioBase64, type, env, true);
      return await generate(space, path, type, body, env);
    }
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: `Red voice cloning failed on Qwen3-TTS: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store",
          "x-red-voice-route": "qwen3-reference-clone",
        },
      },
    );
  }
}
