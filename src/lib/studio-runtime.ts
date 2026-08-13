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
type Endpoint = { parameters?: Parameter[]; description?: string; fn?: string };
type Api = {
  named_endpoints?: Record<string, Endpoint>;
  unnamed_endpoints?: Record<string, Endpoint>;
};
const clients = new Map<string, Promise<Client>>();
const apis = new Map<string, { api: Api; expires: number }>();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string[]> = {
  prompt: ["prompt", "text", "message", "query", "question", "lyrics"],
  text: ["text", "prompt", "message", "lyrics", "targettext"],
  audio: ["audio", "inputaudio", "sourceaudio", "referenceaudio", "refaudio", "file"],
  image: ["image", "inputimage", "sourceimage", "file"],
  video: ["video", "inputvideo", "file"],
  lyrics: ["lyrics", "lyric", "text", "prompt"],
  history: ["history", "messages", "conversation"],
};
function pick(name: string, input: StudioJobInput) {
  const n = norm(name);
  for (const [k, v] of Object.entries(input)) if (norm(k) === n && v != null) return v;
  for (const a of aliases[n] ?? [])
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
  if (n.includes("steps")) return 16;
  if (n.includes("width")) return 1024;
  if (n.includes("height")) return 1024;
  if (n.includes("fps")) return 24;
  if (/bool|checkbox|switch/.test(norm(`${p.component ?? ""} ${p.type ?? ""}`))) return false;
  return undefined;
}
function endpoints(api: Api) {
  return { ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) };
}
function spaceId(space: string) {
  return space.replace(/^https?:\/\/huggingface\.co\/spaces\//, "").replace(/\/$/, "");
}
function proxyOrigin(space: string) {
  return `${window.location.origin}/api/hf-space/${encodeURIComponent(spaceId(space))}`;
}
function artifactUrl(v: unknown): string | null {
  if (typeof v === "string") return /^(https?:|blob:|data:|\/)/i.test(v) ? v : null;
  if (typeof Blob !== "undefined" && v instanceof Blob) return URL.createObjectURL(v);
  if (Array.isArray(v))
    for (const x of v) {
      const u = artifactUrl(x);
      if (u) return u;
    }
  if (v && typeof v === "object")
    for (const key of [
      "url",
      "uri",
      "src",
      "path",
      "value",
      "data",
      "audio",
      "image",
      "video",
      "file",
    ]) {
      const u = artifactUrl((v as Record<string, unknown>)[key]);
      if (u) return u;
    }
  return null;
}
function output(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof Blob !== "undefined" && v instanceof Blob) return v.size > 0;
  if (Array.isArray(v)) return v.some(output);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(output);
  return true;
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = () => reject(r.error ?? new Error("Could not read audio"));
    r.readAsDataURL(blob);
  });
}
function buildArgs(ep: Endpoint, input: StudioJobInput, capability: StudioCapability) {
  return (ep.parameters ?? []).map((p) => {
    const name = norm(p.parameter_name ?? p.label ?? "");
    const value = pick(p.parameter_name ?? p.label ?? "", input);
    if (value != null) return value;
    if (capability === "tts" && (name.includes("refaudio") || name.includes("referenceaudio"))) {
      if (p.optional || p.parameter_has_default || p.default != null) return p.default;
      throw new Error("This voice route requires a reference voice");
    }
    const f = fallback(p);
    if (f !== undefined) return f;
    if (p.optional || p.parameter_has_default) return undefined;
    throw new Error(`Required input unavailable: ${p.parameter_name ?? p.label ?? "unknown"}`);
  });
}
async function connect(space: string) {
  const id = spaceId(space);
  let cached = clients.get(id);
  if (cached) return cached;
  const sources = typeof window === "undefined" ? [id] : [proxyOrigin(id), id];
  cached = (async () => {
    let last: unknown;
    for (const source of sources)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await Client.connect(source, { status_callback: () => undefined });
        } catch (e) {
          last = e;
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
    throw last instanceof Error ? last : new Error(`Could not connect to ${id}`);
  })();
  cached.catch(() => clients.delete(id));
  clients.set(id, cached);
  return cached;
}
async function getApi(space: string) {
  const id = spaceId(space);
  const cached = apis.get(id);
  if (cached && cached.expires > Date.now()) return cached.api;
  const cl = await connect(id);
  if (!cl.view_api) throw new Error("Voice service schema unavailable");
  const a = await cl.view_api();
  if (!Object.keys(endpoints(a)).length) throw new Error("Voice service has no usable endpoints");
  apis.set(id, { api: a, expires: Date.now() + 120000 });
  return a;
}
function score(name: string, ep: Endpoint, capability: StudioCapability, input: StudioJobInput) {
  const h = norm(`${name} ${ep.fn ?? ""} ${ep.description ?? ""}`);
  const words =
    capability === "chat"
      ? ["chat", "text", "message", "generate"]
      : capability === "speech-to-text"
        ? ["transcribe", "speech", "asr", "audio"]
        : capability === "tts"
          ? ["tts", "speech", "voice", "audio"]
          : [
              capability.replace(/-/g, ""),
              "generate",
              "create",
              "text",
              "audio",
              "image",
              "video",
              "music",
              "voice",
            ];
  let s = words.reduce((n, w) => n + (h.includes(w) ? 5 : 0), 0);
  for (const p of ep.parameters ?? [])
    if (pick(p.parameter_name ?? p.label ?? "", input) !== undefined || fallback(p) !== undefined)
      s += 2;
  if (capability === "voice-clone" && /clone|reference/.test(h)) s += 12;
  if (capability === "tts" && /refaudio|referenceaudio/.test(h)) s -= 20;
  return s;
}
async function runCloudflare(
  provider: FreeRunner,
  input: StudioJobInput,
  capability: StudioCapability,
): Promise<StudioArtifact> {
  const prompt =
    typeof input.prompt === "string"
      ? input.prompt.trim()
      : String(input.text ?? input.lyrics ?? "").trim();
  const payload: Record<string, unknown> = {
    capability,
    prompt,
    language: input.language,
    messages: input.messages,
  };
  if (capability === "speech-to-text" && input.audio instanceof Blob)
    payload.audioBase64 = await blobToBase64(input.audio);
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${provider.name}: HTTP ${response.status}`);
  const ct = response.headers.get("content-type") ?? "";
  if (ct.startsWith("audio/") || ct.startsWith("image/") || ct.startsWith("video/")) {
    const blob = await response.blob();
    if (!blob.size) throw new Error(`${provider.name}: empty result`);
    return { capability, value: blob, url: URL.createObjectURL(blob), provider: provider.name };
  }
  const value = await response.json();
  if (!output(value)) throw new Error(`${provider.name}: empty result`);
  return { capability, value, url: artifactUrl(value), provider: provider.name };
}
async function runOn(
  provider: FreeRunner,
  input: StudioJobInput,
  capability: StudioCapability,
): Promise<StudioArtifact> {
  if (provider.url.startsWith("/api/ai/")) return runCloudflare(provider, input, capability);
  const space = spaceId(provider.url);
  const cl = await connect(space);
  const map = endpoints(await getApi(space));
  const candidates = Object.entries(map)
    .map(([name, ep]) => ({ name, ep, score: score(name, ep, capability, input) }))
    .sort((a, b) => b.score - a.score);
  let last = "No compatible endpoint";
  for (const c of candidates) {
    try {
      const args = await Promise.all(
        buildArgs(c.ep, input, capability).map(async (v) =>
          typeof Blob !== "undefined" && v instanceof Blob ? handle_file(v) : v,
        ),
      );
      const r = await cl.predict(c.name, args);
      const value = Array.isArray(r) ? r : (r?.data ?? r);
      const url = artifactUrl(value);
      if (!output(value)) throw new Error("Provider returned no usable result");
      if (
        [
          "tts",
          "music",
          "image",
          "video",
          "voice-clone",
          "voice-swap",
          "vocal-separation",
        ].includes(capability) &&
        !url
      )
        throw new Error("Provider returned no usable media artifact");
      return {
        capability,
        value,
        url: url?.startsWith("/") ? `${proxyOrigin(space)}${url}` : url,
        provider: provider.name,
      };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`${provider.name}: ${last}`);
}
async function prepareVoice(capability: StudioCapability, input: StudioJobInput) {
  if (capability !== "tts" || typeof window === "undefined") return { capability, input };
  const next = { ...input };
  const language = localStorage.getItem("buddy-language");
  const choice = localStorage.getItem("buddy-voice-choice");
  if (language && language !== "Auto") next.language = language;
  if (choice === "My voice") {
    const sample = await getVoiceSample();
    if (sample)
      return {
        capability: "voice-clone" as StudioCapability,
        input: {
          ...next,
          audio: sample,
          refAudio: sample,
          target_text: input.target_text ?? input.text ?? input.prompt ?? "",
        },
      };
  }
  if (choice) next.speaker = choice;
  return { capability, input: next };
}
export async function runStudioJob(
  capability: StudioCapability,
  input: StudioJobInput,
  onStatus?: (s: string) => void,
): Promise<StudioArtifact> {
  const prepared = await prepareVoice(capability, input);
  const providers = runnersFor(prepared.capability);
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      onStatus?.("Working…");
      const result = await Promise.race([
        runOn(provider, prepared.input, prepared.capability),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("Timed out")), 180000),
        ),
      ]);
      onStatus?.("Ready.");
      return { ...result, capability };
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(
    `${capability} could not produce a usable result. ${failures.slice(0, 4).join(" | ")}`,
  );
}
export function runtimeProviders(capability?: StudioCapability) {
  return capability ? runnersFor(capability) : FREE_RUNNERS;
}
export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object")
    for (const key of [
      "text",
      "response",
      "generated_text",
      "transcription",
      "transcript",
      "content",
      "value",
      "data",
      "output",
      "result",
    ]) {
      const text = artifactText((value as Record<string, unknown>)[key]);
      if (text) return text;
    }
  return "";
}
