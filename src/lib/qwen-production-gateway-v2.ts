type Env = { HF_TOKEN?: string; QWEN_TTS_SPACE_URL?: string };
const cache = new Map<string, { path: string; expires: number }>(),
  TTL = 15 * 60 * 1000;
const auth = (e: Env): HeadersInit => (e.HF_TOKEN ? { Authorization: `Bearer ${e.HF_TOKEN}` } : {});
const lang = (v: unknown) =>
  ({
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
  })[
    String(v || "English")
      .trim()
      .toLowerCase()
  ] || String(v || "English").trim();
const ext = (t: string) =>
  t.toLowerCase().includes("mpeg")
    ? "mp3"
    : t.toLowerCase().includes("mp4")
      ? "m4a"
      : t.toLowerCase().includes("webm")
        ? "webm"
        : t.toLowerCase().includes("ogg")
          ? "ogg"
          : "wav";
const dec = (v: string) =>
  Uint8Array.from(atob(v.replace(/^data:[^,]+,/, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
const err = (m: string, s = 502) =>
  Response.json({ ok: false, error: m }, { status: s, headers: { "cache-control": "no-store" } });
function candidate(v: unknown): unknown {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  for (const k of ["url", "path", "audio", "file", "fileData"]) {
    const x = r[k];
    if (typeof x === "string" && x.trim()) return x.trim();
    if (x && typeof x === "object") {
      const n = candidate(x);
      if (n !== undefined) return n;
    }
  }
  if (Array.isArray(r.data)) return candidate(r.data[0]);
  return undefined;
}
function parse(stream: string) {
  let ev = "",
    d: string[] = [],
    audio: unknown,
    error = "";
  const flush = () => {
    if (!d.length) return;
    const p = d.join("\n").trim();
    if (ev === "error" || ev === "cancelled") {
      if (!p || p === "null" || p === "undefined") return;
      try {
        const x = JSON.parse(p) as unknown;
        error = typeof x === "string" ? x : JSON.stringify(x);
      } catch {
        error = p;
      }
      return;
    }
    if (ev !== "complete") return;
    try {
      const x = JSON.parse(p) as unknown;
      if (Array.isArray(x)) {
        const a = candidate(x[0]),
          s = typeof x[1] === "string" ? x[1] : "";
        if (a !== undefined) audio = a;
        else if (/^Error:/i.test(s)) error = s;
      } else {
        const a = candidate(x);
        if (a !== undefined) audio = a;
        else if (
          x &&
          typeof x === "object" &&
          /^Error:/i.test(String((x as Record<string, unknown>).status || ""))
        )
          error = String((x as Record<string, unknown>).status);
      }
    } catch {
      error = "Qwen returned malformed completion data.";
    }
  };
  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (!line.trim()) {
      flush();
      ev = "";
      d = [];
      continue;
    }
    if (line.startsWith("event:")) ev = line.slice(6).trim();
    else if (line.startsWith("data:")) d.push(line.slice(5).trim());
  }
  flush();
  return { audio, error };
}
async function upload(space: string, b: Uint8Array, type: string, e: Env) {
  const f = new FormData(),
    buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  f.append("files", new Blob([buf], { type }), `reference.${ext(type)}`);
  const r = await fetch(`${space}/gradio_api/upload`, {
    method: "POST",
    headers: auth(e),
    body: f,
  });
  if (!r.ok)
    throw new Error(
      `Qwen reference upload failed (${r.status}). ${(await r.text()).slice(0, 240)}`,
    );
  const x = (await r.json()) as unknown;
  if (!Array.isArray(x) || typeof x[0] !== "string")
    throw new Error("Qwen returned no uploaded reference path.");
  return x[0];
}
async function ref(
  body: { referenceId: string; audioBase64?: string; audioType: string },
  space: string,
  e: Env,
) {
  const h = cache.get(body.referenceId);
  if (h && h.expires > Date.now()) return h.path;
  if (!body.audioBase64)
    throw new Error(
      "The saved voice reference expired from the warm server. Please retry once to refresh it.",
    );
  const p = await upload(space, dec(body.audioBase64), body.audioType, e);
  cache.set(body.referenceId, { path: p, expires: Date.now() + TTL });
  return p;
}
async function gen(
  space: string,
  path: string,
  b: {
    audioType: string;
    refText: string;
    text: string;
    language?: string;
    modelSize?: "0.6B" | "1.7B";
  },
  e: Env,
) {
  const file = {
    path,
    orig_name: `reference.${ext(b.audioType)}`,
    mime_type: b.audioType,
    meta: { _type: "gradio.FileData" },
  };
  const s = await fetch(`${space}/gradio_api/call/generate_voice_clone`, {
    method: "POST",
    headers: { ...auth(e), "content-type": "application/json" },
    body: JSON.stringify({
      data: [
        file,
        b.refText,
        b.text,
        lang(b.language),
        false,
        b.modelSize === "0.6B" ? "0.6B" : "1.7B",
      ],
    }),
  });
  if (!s.ok)
    throw new Error(
      `Qwen clone job could not start (${s.status}). ${(await s.text()).slice(0, 300)}`,
    );
  const j = (await s.json()) as { event_id?: string };
  if (!j.event_id) throw new Error("Qwen did not return a clone job ID.");
  const r = await fetch(
    `${space}/gradio_api/call/generate_voice_clone/${encodeURIComponent(j.event_id)}`,
    { headers: { ...auth(e), Accept: "text/event-stream" } },
  );
  if (!r.ok)
    throw new Error(`Qwen clone job failed (${r.status}). ${(await r.text()).slice(0, 300)}`);
  const p = parse(await r.text());
  if (p.error) throw new Error(`Qwen clone job errored: ${String(p.error).slice(0, 500)}`);
  if (p.audio === undefined) throw new Error("Qwen returned no completed clone audio.");
  const i = p.audio,
    u =
      typeof i === "string"
        ? i
        : i && typeof i === "object"
          ? String((i as Record<string, unknown>).url || "")
          : "";
  const q = i && typeof i === "object" ? String((i as Record<string, unknown>).path || "") : "";
  if (u) return u.startsWith("http") ? u : `${space}${u}`;
  if (q) return `${space}/gradio_api/file=${q.replace(/^\//, "")}`;
  throw new Error("Qwen returned an audio artifact without a downloadable URL or path.");
}
export async function handleProductionQwenVoiceClone(request: Request, e: Env) {
  if (request.method !== "POST") return err("POST required.", 405);
  let b: {
    referenceId?: string;
    audioBase64?: string;
    audioType?: string;
    refText?: string;
    text?: string;
    language?: string;
    modelSize?: "0.6B" | "1.7B";
  };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return err("The clone request was not valid JSON.", 400);
  }
  if (!b.referenceId?.trim()) return err("A voice reference ID is required.", 400);
  if (!b.refText?.trim())
    return err("The exact transcript of the reference recording is required.", 400);
  if (!b.text?.trim()) return err("Target text is required.", 400);
  const space = String(e.QWEN_TTS_SPACE_URL || "https://qwen-qwen3-tts.hf.space").replace(
    /\/$/,
    "",
  );
  const type = String(b.audioType || "audio/wav");
  try {
    const path = await ref(
        { referenceId: b.referenceId.trim(), audioBase64: b.audioBase64, audioType: type },
        space,
        e,
      ),
      url = await gen(
        space,
        path,
        {
          audioType: type,
          refText: b.refText.trim(),
          text: b.text.trim().replace(/\s+/g, " ").slice(0, 220),
          language: b.language,
          modelSize: b.modelSize,
        },
        e,
      ),
      g = await fetch(url, { headers: auth(e) });
    if (!g.ok || !g.body)
      throw new Error(`Qwen generated audio could not be downloaded (${g.status}).`);
    const h = new Headers(g.headers);
    h.set("cache-control", "no-store");
    h.set("x-clone-provider", `Qwen3-TTS ${b.modelSize === "0.6B" ? "0.6B" : "1.7B"} Base`);
    h.delete("x-clone-verified");
    return new Response(g.body, { status: 200, headers: h });
  } catch (x) {
    return err(x instanceof Error ? x.message : "Qwen voice cloning failed.");
  }
}
