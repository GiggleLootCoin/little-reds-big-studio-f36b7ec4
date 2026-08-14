import { Client, handle_file } from "@gradio/client";
import { FREE_RUNNERS, type FreeRunner, runnersFor } from "./free-runners";
import { getBuddyVoiceProfile, getBuddyVoiceSample } from "./buddy-voice";

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

function spaceId(space: string) {
  return space.replace(/^https?:\/\/huggingface\.co\/spaces\//, "").replace(/\/$/, "");
}
function proxyOrigin(space: string) {
  return `${window.location.origin}/api/hf-space/${encodeURIComponent(spaceId(space))}`;
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
function numericSamples(v: unknown): number[] | null {
  if (v instanceof Float32Array || v instanceof Float64Array || v instanceof Int16Array)
    return Array.from(v);
  if (Array.isArray(v) && v.length && v.every((x) => typeof x === "number" && Number.isFinite(x)))
    return v as number[];
  return null;
}
function wavUrl(sampleRate: number, samples: number[]) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !samples.length) return null;
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const n = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const write = (at: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate * 2), true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}
function artifactUrl(v: unknown): string | null {
  if (Array.isArray(v) && v.length >= 2 && typeof v[0] === "number") {
    const samples = numericSamples(v[1]);
    if (samples) return wavUrl(v[0], samples);
  }
  if (typeof v === "string") return /^(https?:|blob:|data:|\/)/i.test(v) ? v : null;
  if (typeof Blob !== "undefined" && v instanceof Blob) return URL.createObjectURL(v);
  if (Array.isArray(v))
    for (const x of v) {
      const u = artifactUrl(x);
      if (u) return u;
    }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const sr = o.sample_rate ?? o.sampleRate ?? o.sr;
    const samples = numericSamples(o.waveform ?? o.samples ?? o.data);
    if (typeof sr === "number" && samples) return wavUrl(sr, samples);
    for (const k of ["url", "uri", "src", "path", "value", "audio", "file", "data"]) {
      const u = artifactUrl(o[k]);
      if (u) return u;
    }
  }
  return null;
}
function pick(name: string, input: StudioJobInput) {
  const n = norm(name);
  for (const [k, v] of Object.entries(input)) if (norm(k) === n && v != null) return v;
  const aliases: Record<string, string[]> = {
    prompt: ["text", "message", "query", "lyrics"],
    text: ["prompt", "message", "targettext", "lyrics"],
    audio: ["inputaudio", "sourceaudio", "referenceaudio", "refaudio", "file"],
    referenceaudio: ["refaudio", "audio", "file"],
    refaudio: ["referenceaudio", "audio", "file"],
    targettext: ["text", "prompt"],
    language: ["lang"],
    speaker: ["voice", "speakername"],
  };
  for (const a of aliases[n] ?? [])
    for (const [k, v] of Object.entries(input)) if (norm(k) === norm(a) && v != null) return v;
  if (n.includes("audio")) return input.audio ?? input.refAudio ?? input.referenceAudio;
  if (n.includes("image")) return input.image;
  if (n.includes("video")) return input.video;
  if (n.includes("history") || n.includes("conversation"))
    return input.history ?? input.messages ?? [];
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
function buildArgs(ep: Endpoint, input: StudioJobInput, capability: StudioCapability) {
  return (ep.parameters ?? []).map((p) => {
    const name = norm(p.parameter_name ?? p.label ?? "");
    const value = pick(p.parameter_name ?? p.label ?? "", input);
    if (value != null) return value;
    if (
      capability === "voice-clone" &&
      /refaudio|referenceaudio|referencevoice|voiceprompt/.test(name)
    )
      throw new Error("Clone endpoint requires the saved reference voice");
    const f = fallback(p);
    if (f !== undefined) return f;
    if (p.optional || p.parameter_has_default) return undefined;
    throw new Error(`Required input unavailable: ${p.parameter_name ?? p.label ?? "unknown"}`);
  });
}
async function connect(space: string) {
  const id = spaceId(space);
  const existing = clients.get(id);
  if (existing) return existing;
  const sources = typeof window === "undefined" ? [id] : [id, proxyOrigin(id)];
  const promise = (async () => {
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
  promise.catch(() => clients.delete(id));
  clients.set(id, promise);
  return promise;
}
async function getApi(space: string) {
  const id = spaceId(space);
  const cached = apis.get(id);
  if (cached && cached.expires > Date.now()) return cached.api;
  const cl = await connect(id);
  if (!cl.view_api) throw new Error("Voice service schema unavailable");
  const api = await cl.view_api();
  if (!Object.keys(endpoints(api)).length)
    throw new Error("Voice service has no callable endpoints");
  apis.set(id, { api, expires: Date.now() + 120000 });
  return api;
}
function score(name: string, ep: Endpoint, capability: StudioCapability, input: StudioJobInput) {
  const h = norm(`${name} ${ep.fn ?? ""} ${ep.description ?? ""}`);
  let s = 0;
  const words =
    capability === "voice-clone"
      ? ["clone", "zero", "reference", "voice"]
      : capability === "tts"
        ? ["tts", "speech", "voice", "generate"]
        : [
            capability.replace(/-/g, ""),
            "generate",
            "create",
            "text",
            "audio",
            "image",
            "video",
            "music",
          ];
  for (const w of words) if (h.includes(w)) s += 6;
  if (capability === "voice-clone" && (h.includes("clone") || h.includes("reference"))) s += 30;
  for (const p of ep.parameters ?? [])
    if (pick(p.parameter_name ?? p.label ?? "", input) !== undefined) s += 3;
  return s;
}
async function runCloudflare(
  provider: FreeRunner,
  input: StudioJobInput,
  capability: StudioCapability,
): Promise<StudioArtifact> {
  const prompt = String(
    input.prompt ?? input.text ?? input.target_text ?? input.lyrics ?? "",
  ).trim();
  const payload: Record<string, unknown> = {
    capability,
    prompt,
    text: prompt,
    language: input.language,
    speaker: input.speaker,
    messages: input.messages,
  };
  if (input.audio instanceof Blob) {
    const bytes = new Uint8Array(await input.audio.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    payload.audioBase64 = btoa(binary);
  }
  const response = await fetch(provider.url, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
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
async function runQwen(
  cl: Client,
  input: StudioJobInput,
  capability: StudioCapability,
): Promise<StudioArtifact> {
  if (capability === "tts") {
    const text = String(input.text ?? input.target_text ?? input.prompt ?? "").trim();
    if (!text) throw new Error("Voice text is empty");
    const speaker = String(input.speaker ?? "Ryan");
    const language = String(input.language ?? "English");
    let last: unknown;
    for (const size of [String(input.model_size ?? "1.7B"), "0.6B"])
      try {
        const r = await cl.predict("/generate_custom_voice", [
          text,
          language,
          speaker,
          String(input.instruction ?? ""),
          size,
        ]);
        const value = Array.isArray(r) ? r : ((r as { data?: unknown[] }).data ?? r);
        const url = artifactUrl(value);
        if (!url) throw new Error("Qwen returned no playable audio");
        return { capability, value, url, provider: `Qwen3-TTS (${speaker})` };
      } catch (e) {
        last = e;
      }
    throw last instanceof Error ? last : new Error("Qwen TTS failed");
  }
  const sample = input.refAudio ?? input.referenceAudio ?? input.audio;
  if (!(sample instanceof Blob)) throw new Error("Voice clone sample is missing");
  const text = String(input.target_text ?? input.text ?? input.prompt ?? "").trim();
  if (!text) throw new Error("Voice clone text is empty");
  const ref = await handle_file(sample);
  const refText = String(input.referenceTranscript ?? input.refText ?? "");
  let last: unknown;
  for (const size of [String(input.model_size ?? "1.7B"), "0.6B"])
    try {
      const r = await cl.predict("/generate_voice_clone", [
        ref,
        refText,
        text,
        String(input.language ?? "English"),
        false,
        size,
      ]);
      const value = Array.isArray(r) ? r : ((r as { data?: unknown[] }).data ?? r);
      const url = artifactUrl(value);
      if (!url) throw new Error("Qwen returned no playable cloned audio");
      return { capability, value, url, provider: "Qwen3-TTS Voice Clone" };
    } catch (e) {
      last = e;
    }
  throw last instanceof Error ? last : new Error("Qwen voice clone failed");
}
async function runSpace(
  provider: FreeRunner,
  input: StudioJobInput,
  capability: StudioCapability,
): Promise<StudioArtifact> {
  const space = spaceId(provider.url);
  const cl = await connect(space);
  if (space === "Qwen/Qwen3-TTS" && (capability === "tts" || capability === "voice-clone"))
    return runQwen(cl, input, capability);
  const api = endpoints(await getApi(space));
  const candidates = Object.entries(api)
    .map(([name, ep]) => ({ name, ep, score: score(name, ep, capability, input) }))
    .sort((a, b) => b.score - a.score);
  let last = "No compatible endpoint";
  for (const c of candidates) {
    try {
      const args = await Promise.all(
        buildArgs(c.ep, input, capability).map(async (v) =>
          v instanceof Blob ? handle_file(v) : v,
        ),
      );
      const r = await cl.predict(c.name, args);
      const value = Array.isArray(r) ? r : ((r as { data?: unknown[] }).data ?? r);
      const url = artifactUrl(value);
      if (!output(value)) throw new Error("Provider returned no usable result");
      if (
        [
          "tts",
          "voice-clone",
          "voice-swap",
          "music",
          "image",
          "video",
          "vocal-separation",
        ].includes(capability) &&
        !url
      )
        throw new Error("Provider returned no playable media");
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
  const profile = getBuddyVoiceProfile();
  const next = { ...input };
  if (profile.language && profile.language !== "Auto") next.language = profile.language;
  if (profile.mode === "clone") {
    if (!profile.cloneVerified)
      throw new Error(
        "Your custom voice is not verified yet. Generate and verify the clone first.",
      );
    if (!profile.referenceTranscript?.trim())
      throw new Error(
        "Your custom voice needs a verified reference transcript before Buddy can speak with it.",
      );
    const sample = await getBuddyVoiceSample();
    if (!sample) throw new Error("Your saved Buddy voice sample is unavailable. Record it again.");
    next.audio = sample;
    next.refAudio = sample;
    next.referenceAudio = sample;
    next.target_text = input.target_text ?? input.text ?? input.prompt ?? "";
    next.referenceTranscript = profile.referenceTranscript ?? "";
    next.refText = profile.referenceTranscript ?? "";
    return { capability: "voice-clone" as StudioCapability, input: next };
  }
  next.speaker = profile.speaker;
  next.text = input.text ?? input.target_text ?? input.prompt ?? "";
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
        provider.url.startsWith("/api/ai/")
          ? runCloudflare(provider, prepared.input, prepared.capability)
          : runSpace(provider, prepared.input, prepared.capability),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("Timed out")), 180000),
        ),
      ]);
      if (
        !result.url &&
        [
          "tts",
          "voice-clone",
          "voice-swap",
          "music",
          "image",
          "video",
          "vocal-separation",
        ].includes(prepared.capability)
      )
        throw new Error("No playable artifact returned");
      onStatus?.("Ready.");
      return { ...result, capability };
    } catch (e) {
      failures.push(`${provider.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(
    `${capability} could not produce a usable result. ${failures.slice(0, 4).join(" | ")}`,
  );
}
export function runtimeProviders(capability?: StudioCapability) {
  return capability ? runnersFor(capability) : FREE_RUNNERS;
}
