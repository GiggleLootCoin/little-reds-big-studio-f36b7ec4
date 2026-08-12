import { FREE_RUNNERS, type FreeRunner } from "@/lib/free-runners";

type GradioEndpoint = {
  parameters?: Array<{
    label?: string;
    parameter_name?: string;
    type?: string;
    component?: string;
    default?: unknown;
    optional?: boolean;
    parameter_has_default?: boolean;
  }>;
  returns?: unknown[];
  description?: string;
};

type GradioApi = {
  named_endpoints?: Record<string, GradioEndpoint>;
  unnamed_endpoints?: Record<string, GradioEndpoint>;
};

type GradioClient = {
  predict: (endpoint: string, payload?: unknown[]) => Promise<{ data?: unknown[] } | unknown[]>;
  view_api?: () => Promise<GradioApi>;
};

type GradioModule = {
  Client: { connect: (space: string, options?: Record<string, unknown>) => Promise<GradioClient> };
  handle_file: (value: File | Blob | string) => unknown;
};

export type GenerationKind = "lyrics" | "music" | "image" | "video" | "stems";
export type GenerationResult = {
  kind: GenerationKind;
  runner: FreeRunner;
  artifactUrl?: string;
  text?: string;
  raw: unknown;
};

const modulePromise = new Function(
  "return import('https://esm.sh/@gradio/client@2.4.0')",
) as () => Promise<GradioModule>;

const clients = new Map<string, Promise<GradioClient>>();
const apiCache = new Map<string, { api: GradioApi; expires: number }>();

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function endpointEntries(api: GradioApi) {
  return Object.entries(api.named_endpoints ?? {}).concat(Object.entries(api.unnamed_endpoints ?? {}));
}

function endpointScore(endpoint: string, spec: GradioEndpoint, kind: GenerationKind) {
  const hay = normalize(`${endpoint} ${spec.description ?? ""}`);
  const wanted: Record<GenerationKind, string[]> = {
    lyrics: ["lyric", "text", "write", "generate"],
    music: ["music", "song", "generate", "infer"],
    image: ["image", "generate", "infer"],
    video: ["video", "generate", "infer"],
    stems: ["stem", "separate", "vocal", "demucs"],
  };
  return wanted[kind].reduce((score, word) => score + (hay.includes(normalize(word)) ? 10 : 0), 0);
}

function aliases(parameter: string) {
  const name = normalize(parameter);
  if (name.includes("lyrics") || name.includes("prompt") || name.includes("description") || name.includes("text"))
    return ["prompt", "text", "lyrics", "description", "query"];
  if (name.includes("audio") || name.includes("file") || name.includes("input"))
    return ["audio", "inputaudio", "sourceaudio", "file", "input"];
  if (name.includes("image")) return ["image", "inputimage", "sourceimage", "file", "input"];
  if (name.includes("video")) return ["video", "inputvideo", "sourcevideo", "file", "input"];
  if (name.includes("duration") || name.includes("seconds")) return ["duration", "seconds"];
  if (name.includes("language") || name === "lang") return ["language", "lang"];
  return [];
}

function valueFor(parameter: string, input: Record<string, unknown>) {
  const name = normalize(parameter);
  for (const [key, value] of Object.entries(input)) {
    if (normalize(key) === name && value !== undefined) return value;
  }
  for (const alias of aliases(parameter)) {
    for (const [key, value] of Object.entries(input)) {
      if (normalize(key) === alias && value !== undefined) return value;
    }
  }
  if (name.includes("duration") || name.includes("seconds")) return input.duration ?? 180;
  if (name.includes("language") || name === "lang") return input.language ?? "English";
  if (name.includes("seed")) return -1;
  if (name.includes("steps")) return 8;
  if (name.includes("width")) return 1024;
  if (name.includes("height")) return 576;
  if (name.includes("guidance") || name.includes("cfg")) return 5;
  if (name.includes("random")) return true;
  return undefined;
}

function buildPayload(spec: GradioEndpoint, input: Record<string, unknown>, handleFile: GradioModule["handle_file"]) {
  return (spec.parameters ?? []).map((parameter) => {
    const raw = valueFor(parameter.parameter_name ?? parameter.label ?? "", input);
    if (raw !== undefined) {
      const type = normalize(`${parameter.type ?? ""} ${parameter.component ?? ""}`);
      if (raw instanceof Blob && (type.includes("audio") || type.includes("image") || type.includes("file"))) return handleFile(raw);
      return raw;
    }
    if (parameter.default !== undefined) return parameter.default;
    if (parameter.optional || parameter.parameter_has_default) return undefined;
    throw new Error(`Missing required generation input: ${parameter.parameter_name ?? parameter.label ?? "unknown"}`);
  });
}

function usable(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (value instanceof Blob) return value.size > 0;
  if (Array.isArray(value)) return value.some(usable);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(usable);
  return value != null;
}

function artifactUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^(https?:\/\/|blob:|data:|\/)/i.test(value)) return value;
  if (value instanceof Blob) return URL.createObjectURL(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = artifactUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "path", "name", "data"]) {
      const found = artifactUrl(record[key]);
      if (found) return found;
    }
    for (const item of Object.values(record)) {
      const found = artifactUrl(item);
      if (found) return found;
    }
  }
  return undefined;
}

function textArtifact(value: unknown): string | undefined {
  if (typeof value === "string" && !/^https?:\/\//i.test(value)) return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = textArtifact(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const key of ["text", "generated_text", "content", "value", "data"]) {
      const found = textArtifact((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return undefined;
}

async function clientFor(space: string, status?: (message: string) => void) {
  let promise = clients.get(space);
  if (!promise) {
    promise = modulePromise().then(({ Client }) =>
      Client.connect(space, {
        events: ["data", "status"],
        status_callback: (state: unknown) => {
          const message = state && typeof state === "object" ? String((state as { message?: unknown }).message ?? "") : "";
          if (message) status?.(message);
        },
      }),
    );
    promise.catch(() => clients.delete(space));
    clients.set(space, promise);
  }
  return promise;
}

async function apiFor(space: string, client: GradioClient) {
  const cached = apiCache.get(space);
  if (cached && cached.expires > Date.now()) return cached.api;
  if (!client.view_api) throw new Error("This public engine does not expose a discoverable API.");
  const api = await client.view_api();
  if (!endpointEntries(api).length) throw new Error("This public engine has no callable endpoints.");
  apiCache.set(space, { api, expires: Date.now() + 60_000 });
  return api;
}

export async function executeFreeGeneration(
  kind: GenerationKind,
  input: Record<string, unknown>,
  status?: (message: string) => void,
): Promise<GenerationResult> {
  const capabilities: Record<GenerationKind, string> = {
    lyrics: "writing",
    music: "music",
    image: "image",
    video: "video",
    stems: "stems",
  };
  const routes = FREE_RUNNERS.filter((runner) => runner.capabilities.includes(capabilities[kind])).sort(
    (a, b) => b.priority - a.priority,
  );
  let lastError = "No compatible free route is available.";

  for (const runner of routes) {
    try {
      status?.("Buddy is checking a compatible free engine…");
      const client = await clientFor(runner.url.replace("https://huggingface.co/spaces/", ""), status);
      const api = await apiFor(runner.url.replace("https://huggingface.co/spaces/", ""), client);
      const candidates = endpointEntries(api)
        .filter(([, spec]) => {
          try {
            buildPayload(spec, input, (value) => value);
            return true;
          } catch {
            return false;
          }
        })
        .sort((a, b) => endpointScore(b[0], b[1], kind) - endpointScore(a[0], a[1], kind));
      if (!candidates[0]) throw new Error("No compatible endpoint was advertised.");
      const { handle_file } = await modulePromise();
      const payload = buildPayload(candidates[0][1], input, handle_file);
      status?.("Engine is running. Buddy will only report success after an actual result returns.");
      const response = await client.predict(candidates[0][0], payload);
      const raw = Array.isArray(response) ? response : response.data ?? response;
      if (!usable(raw)) throw new Error("The engine returned no usable artifact.");
      const url = artifactUrl(raw);
      const text = textArtifact(raw);
      if (kind !== "lyrics" && !url) throw new Error("The engine returned data but no usable media artifact.");
      return { kind, runner, artifactUrl: url, text, raw };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Free engine failed.";
      status?.("That free route is unavailable; Buddy is silently trying another compatible route.");
    }
  }

  throw new Error(lastError);
}
