import { Client, handle_file } from "@gradio/client";
import { FREE_RUNNERS, type FreeRunner, runnersFor } from "./free-runners";
import { getVoiceSample } from "./voice-profile";

export type StudioCapability =
  | "chat"
  | "speech-to-text"
  | "music"
  | "image"
  | "video"
  | "voice-clone"
  | "voice-swap"
  | "vocal-separation"
  | "tts";
export type StudioJobInput = Record<string, unknown>;
export type StudioArtifact = {
  capability: StudioCapability;
  value: unknown;
  url: string | null;
  provider: string;
};
type Parameter = {
  parameter_name?: string;
  label?: string;
  component?: string;
  type?: string;
  default?: unknown;
  optional?: boolean;
  parameter_has_default?: boolean;
};
type Endpoint = {
  parameters?: Parameter[];
  returns?: unknown[];
  description?: string;
  fn?: string;
};
type Api = {
  named_endpoints?: Record<string, Endpoint>;
  unnamed_endpoints?: Record<string, Endpoint>;
};
const clients = new Map<string, Promise<Client>>();
const apis = new Map<string, { api: Api; expires: number }>();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases = (n: string) =>
  ({
    prompt: ["prompt", "text", "message", "query", "question", "lyrics"],
    text: ["text", "prompt", "message", "lyrics", "targettext"],
    audio: ["audio", "inputaudio", "sourceaudio", "referenceaudio", "refaudio", "file"],
    image: ["image", "inputimage", "sourceimage", "file"],
    video: ["video", "inputvideo", "file"],
    lyrics: ["lyrics", "lyric", "text", "prompt"],
    history: ["history", "messages", "conversation"],
  })[n] ?? [];
function pick(name: string, input: StudioJobInput) {
  const n = norm(name);
  for (const [k, v] of Object.entries(input)) if (norm(k) === n && v != null) return v;
  for (const a of aliases(n))
    for (const [k, v] of Object.entries(input)) if (norm(k) === norm(a) && v != null) return v;
  if (n.includes("history") || n.includes("conversation"))
    return input.history ?? input.messages ?? [];
  if (n.includes("image")) return input.image;
  if (n.includes("audio")) return input.audio ?? input.refAudio ?? input.referenceAudio;
  if (n.includes("video")) return input.video;
  return undefined;
}
function fallback(p: Parameter) {
  if (p.default != null) return p.default;
  if (p.optional || p.parameter_has_default) return undefined;
  const n = norm(p.parameter_name ?? p.label ?? "");
  if (n.includes("seed")) return -1;
  if (n.includes("duration") || n.includes("seconds")) return 30;
  if (n.includes("steps")) return 16;
  if (n.includes("width")) return 1024;
  if (n.includes("height")) return 1024;
  if (n.includes("fps")) return 24;
  if (/bool|checkbox|switch/.test(norm(`${p.component ?? ""} ${p.type ?? ""}`))) return false;
  return undefined;
}
function build(ep: Endpoint, input: StudioJobInput) {
  return (ep.parameters ?? []).map((p) => {
    const v = pick(p.parameter_name ?? p.label ?? "", input);
    if (v != null) return v;
    const f = fallback(p);
    if (f !== undefined) return f;
    if (p.optional || p.parameter_has_default) return false;
    throw new Error(
      `Required runtime input is unavailable: ${p.parameter_name ?? p.label ?? "unknown"}`,
    );
  });
}
function endpoints(api: Api) {
  return { ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) };
}
function output(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof Blob !== "undefined" && v instanceof Blob) return v.size > 0;
  if (Array.isArray(v)) return v.some(output);
  if (typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (typeof r.size === "number" && r.size <= 0) return false;
    if (typeof r.is_stream === "boolean" && r.is_stream) return false;
    return Object.values(r).some(output);
  }
  return true;
}
function artifactUrl(v: unknown): string | null {
  if (typeof v === "string") {
    if (/^(https?:|blob:|data:)/i.test(v)) return v;
    if (/^(\/gradio_api\/file=|\/file=|file=)/i.test(v)) return v;
    return null;
  }
  if (typeof Blob !== "undefined" && v instanceof Blob) return URL.createObjectURL(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = artifactUrl(x);
      if (u) return u;
    }
  }
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    // Prefer an actual browser URL over an internal filesystem path.
    for (const key of ["url", "uri", "src", "path", "value", "data"]) {
      const u = artifactUrl(r[key]);
      if (u) return u;
    }
  }
  return null;
}
function origin(space: string) {
  const slug = space
    .replace(/^https?:\/\/huggingface\.co\/spaces\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `https://${slug}.hf.space`;
}
function proxyOrigin(space: string) {
  const token = encodeURIComponent(space);
  return `${window.location.origin}/api/hf-space/${token}`;
}
function normalizeUrl(u: string | null, space: string) {
  if (!u) return null;
  if (/^(https?:|blob:|data:)/i.test(u)) return u;
  if (u.startsWith("/")) return `${proxyOrigin(space)}${u}`;
  if (/^file=/i.test(u)) return `${proxyOrigin(space)}/gradio_api/${u}`;
  return u;
}
async function client(space: string) {
  let p = clients.get(space);
  if (!p) {
    const source = typeof window === "undefined" ? origin(space) : proxyOrigin(space);
    p = Client.connect(source, {
      status_callback: (status) => {
        if (status.status === "sleeping" || status.status === "building") {
          console.info(`[Studio] ${space}: ${status.status}`);
        }
      },
    });
    p.catch(() => clients.delete(space));
    clients.set(space, p);
  }
  return p;
}
async function api(space: string) {
  const cached = apis.get(space);
  if (cached && cached.expires > Date.now()) return cached.api;
  const cl = await client(space);
  if (!cl.view_api) throw new Error("Runtime schema discovery unavailable");
  const a = await cl.view_api();
  if (!Object.keys(endpoints(a)).length) throw new Error("Provider exposes no callable endpoints");
  apis.set(space, { api: a, expires: Date.now() + 30000 });
  return a;
}
function score(ep: Endpoint, name: string, input: StudioJobInput, capability: StudioCapability) {
  const h = norm(`${name} ${ep.fn ?? ""} ${ep.description ?? ""}`);
  const words =
    capability === "chat"
      ? ["chat", "text", "generate", "message"]
      : capability === "speech-to-text"
        ? ["transcribe", "speech", "audio", "asr"]
        : capability === "tts"
          ? ["tts", "speech", "voice", "audio"]
          : [
              "generate",
              "create",
              capability.replace(/-/g, ""),
              "text",
              "audio",
              "image",
              "video",
              "music",
              "voice",
            ];
  let s = 0;
  for (const w of words) if (h.includes(w)) s += 4;
  for (const p of ep.parameters ?? [])
    s +=
      pick(p.parameter_name ?? p.label ?? "", input) !== undefined || fallback(p) !== undefined
        ? 2
        : -20;
  if (capability === "voice-clone" && (h.includes("clone") || h.includes("reference"))) s += 10;
  if (
    capability === "voice-swap" &&
    (h.includes("convert") || h.includes("vc") || h.includes("infer"))
  )
    s += 10;
  if (
    capability === "music" &&
    (h.includes("song") || h.includes("music") || h.includes("generate"))
  )
    s += 8;
  return s;
}
function validateArtifact(capability: StudioCapability, value: unknown, url: string | null) {
  if (!output(value)) throw new Error("Provider returned no usable artifact");
  if (
    ["music", "image", "video", "voice-clone", "voice-swap", "vocal-separation", "tts"].includes(
      capability,
    ) &&
    !url
  )
    throw new Error("Provider returned data without a downloadable media artifact");
  if (["chat", "speech-to-text"].includes(capability) && !artifactText(value))
    throw new Error("Provider returned no usable text");
}
async function runOn(provider: FreeRunner, input: StudioJobInput, capability: StudioCapability) {
  const space = provider.url.replace("https://huggingface.co/spaces/", "");
  const cl = await client(space);
  const map = endpoints(await api(space));
  const candidates = Object.entries(map)
    .map(([name, ep]) => ({ name, ep, s: score(ep, name, input, capability) }))
    .filter((x) => x.s > -10)
    .sort((a, b) => b.s - a.s);
  if (!candidates[0]) throw new Error("No compatible endpoint discovered");
  let last = "No endpoint produced a usable result";
  for (const candidate of candidates) {
    try {
      const args = await Promise.all(
        build(candidate.ep, input).map(async (v) =>
          typeof Blob !== "undefined" && v instanceof Blob ? handle_file(v) : v,
        ),
      );
      const r = await cl.predict(candidate.name, args);
      const data = Array.isArray(r) ? r : (r?.data ?? r);
      const url = normalizeUrl(artifactUrl(data), space);
      validateArtifact(capability, data, url);
      return { capability, value: data, url, provider: provider.name } as StudioArtifact;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(last);
}
function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}
async function prepareVoiceInput(
  capability: StudioCapability,
  input: StudioJobInput,
): Promise<{ capability: StudioCapability; input: StudioJobInput }> {
  if (capability !== "tts" || typeof window === "undefined") return { capability, input };
  const language = localStorage.getItem("buddy-language");
  const choice = localStorage.getItem("buddy-voice-choice");
  const next = { ...input };
  if (language && language !== "Auto") next.language = language;
  if (choice === "My voice") {
    const sample = await getVoiceSample();
    if (sample)
      return {
        capability: "voice-clone",
        input: {
          ...next,
          refAudio: sample,
          audio: sample,
          target_text: input.target_text ?? input.text ?? input.prompt ?? "",
          use_xvector_only: true,
        },
      };
  } else if (choice) {
    next.speaker = choice;
  }
  return { capability, input: next };
}
export async function runStudioJob(
  capability: StudioCapability,
  input: StudioJobInput,
  onStatus?: (s: string) => void,
): Promise<StudioArtifact> {
  const prepared = await prepareVoiceInput(capability, input);
  const providers = runnersFor(prepared.capability);
  let last = "No compatible provider available";
  for (const p of providers) {
    try {
      onStatus?.(`Connecting to ${p.name}…`);
      const result = await withTimeout(
        runOn(p, prepared.input, prepared.capability),
        180000,
        `${p.name} route`,
      );
      onStatus?.(`Result verified from ${p.name}.`);
      return { ...result, capability };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      onStatus?.(`${p.name} was unavailable; trying the next compatible route…`);
    }
  }
  throw new Error(`${capability} could not produce a usable result. ${last}`);
}
export function runtimeProviders(capability?: StudioCapability) {
  return capability ? runnersFor(capability) : FREE_RUNNERS;
}
export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) || "";
  if (value && typeof value === "object") {
    const r = value as Record<string, unknown>;
    for (const k of [
      "text",
      "generated_text",
      "transcription",
      "transcript",
      "content",
      "value",
      "data",
    ]) {
      const t = artifactText(r[k]);
      if (t) return t;
    }
  }
  return "";
}
