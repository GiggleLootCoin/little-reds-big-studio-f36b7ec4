import { Client, handle_file } from "@gradio/client";
import { FREE_RUNNERS, type FreeRunner, runnersFor } from "./free-runners";

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
  if (n.includes("history") || n.includes("conversation")) return input.history ?? input.messages ?? [];
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
    throw new Error(`Required runtime input is unavailable: ${p.parameter_name ?? p.label ?? "unknown"}`);
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
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(output);
  return true;
}
function artifactUrl(v: unknown): string | null {
  if (typeof v === "string" && /^(https?:|blob:|data:|\/gradio_api\/file=|\/file=|file=)/i.test(v)) return v;
  if (typeof Blob !== "undefined" && v instanceof Blob) return URL.createObjectURL(v);
  if (Array.isArray(v))
    for (const x of v) {
      const u = artifactUrl(x);
      if (u) return u;
    }
  if (v && typeof v === "object")
    for (const x of Object.values(v as Record<string, unknown>)) {
      const u = artifactUrl(x);
      if (u) return u;
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
function normalizeUrl(u: string | null, space: string) {
  if (!u || /^(https?:|blob:|data:)/.test(u)) return u;
  if (u.startsWith("/")) return `${origin(space)}${u}`;
  return u;
}
function qualityGate(capability: StudioCapability, data: unknown, url: string | null) {
  if (!output(data)) throw new Error("Provider returned no usable artifact");
  if (["tts", "voice-clone", "voice-swap", "vocal-separation", "music", "image", "video"].includes(capability) && !url) {
    throw new Error(`${capability} provider returned data without a playable/downloadable artifact`);
  }
  if (capability === "tts" && typeof data === "string" && !/\.(wav|mp3|ogg|m4a|webm|flac)(\?|$)/i.test(data)) {
    throw new Error("TTS provider returned text/metadata instead of audio");
  }
}
async function client(space: string) {
  let p = clients.get(space);
  if (!p) {
    p = Client.connect(space);
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
          : ["generate", "create", capability.replace(/-/g, ""), "text", "audio", "image", "video", "music", "voice"];
  let s = 0;
  for (const w of words) if (h.includes(w)) s += 4;
  for (const p of ep.parameters ?? [])
    s += pick(p.parameter_name ?? p.label ?? "", input) !== undefined || fallback(p) !== undefined ? 2 : -20;
  return s;
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
  const args = await Promise.all(
    build(candidates[0].ep, input).map(async (v) => (typeof Blob !== "undefined" && v instanceof Blob ? handle_file(v) : v)),
  );
  const r = await cl.predict(candidates[0].name, args);
  const data = Array.isArray(r) ? r : (r?.data ?? r);
  const url = normalizeUrl(artifactUrl(data), provider.url);
  qualityGate(capability, data, url);
  return { capability, value: data, url, provider: provider.name } as StudioArtifact;
}
export async function runStudioJob(capability: StudioCapability, input: StudioJobInput, onStatus?: (s: string) => void): Promise<StudioArtifact> {
  const providers = runnersFor(capability);
  let last = "No compatible provider available";
  for (const p of providers) {
    try {
      onStatus?.("Checking a compatible route…");
      const result = await runOn(p, input, capability);
      onStatus?.("Result verified.");
      return result;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      onStatus?.("Trying a fallback route…");
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
    for (const k of ["text", "generated_text", "transcription", "transcript", "content", "value", "data"]) {
      const t = artifactText(r[k]);
      if (t) return t;
    }
  }
  return "";
}
