import { Client, handle_file } from "@gradio/client";

export type ApplioConversionRequest = {
  audio: File | Blob;
  model?: File | Blob | string;
  index?: File | Blob | string;
  pitch?: number;
  indexRate?: number;
  protect?: number;
  f0Method?: "rmvpe" | "crepe" | "crepe-tiny" | "fcpe";
  autotune?: boolean;
};

const DEFAULT_PITCH = 0;
const DEFAULT_INDEX_RATE = 0.75;
const DEFAULT_PROTECT = 0.5;
const DEFAULT_F0_METHOD = "rmvpe" as const;
const MIN_AUDIO_BYTES = 256;
const APPLIO_SPACE = "IAHispano/ApplioX";

export function normalizeApplioUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Applio must be configured with a valid HTTP URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Applio must be configured with a valid HTTP URL.");
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function buildApplioFormData(input: ApplioConversionRequest): FormData {
  if (!input.audio || input.audio.size < MIN_AUDIO_BYTES) {
    throw new Error("A non-empty source vocal is required for RVC conversion.");
  }

  const form = new FormData();
  const audio =
    input.audio instanceof File
      ? input.audio
      : new File([input.audio], "source-vocals.wav", {
          type: input.audio.type || "audio/wav",
        });

  form.set("audio", audio);
  if (input.model) form.set("model", String(input.model));
  if (input.index) form.set("index", String(input.index));
  form.set("pitch", String(input.pitch ?? DEFAULT_PITCH));
  form.set("index_rate", String(input.indexRate ?? DEFAULT_INDEX_RATE));
  form.set("protect", String(input.protect ?? DEFAULT_PROTECT));
  form.set("f0_method", input.f0Method ?? DEFAULT_F0_METHOD);
  form.set("autotune", String(input.autotune ?? false));

  return form;
}

export async function validateApplioResponse(response: Response): Promise<boolean> {
  if (!response.ok) return false;

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("audio/")) return false;

  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  return bytes.byteLength >= MIN_AUDIO_BYTES;
}

function labelFor(parameter: { label?: string; parameter_name?: string }): string {
  return `${parameter.label ?? ""} ${parameter.parameter_name ?? ""}`.toLowerCase();
}

function valueForApplioParameter(
  parameter: {
    label?: string;
    parameter_name?: string;
    parameter_default?: unknown;
    parameter_has_default?: boolean;
  },
  request: ApplioConversionRequest,
): unknown {
  const label = labelFor(parameter);

  if (label.includes("voice model")) {
    if (!request.model) throw new Error("An Applio RVC voice model is required.");
    return typeof request.model === "string"
      ? handle_file(request.model)
      : handle_file(request.model);
  }
  if (label.includes("index file")) {
    if (!request.index) return null;
    return typeof request.index === "string"
      ? handle_file(request.index)
      : handle_file(request.index);
  }
  if (label.includes("select audio")) return handle_file(request.audio);
  if (label.includes("agree to the terms")) return true;
  if (label.includes("output path")) return "assets/audios/little-red-rvc-output.wav";
  if (label.includes("export format")) return "WAV";
  if (label.includes("speaker id")) return 0;
  if (label.includes("pitch extraction")) return request.f0Method ?? DEFAULT_F0_METHOD;
  if (label.includes("search feature ratio")) return request.indexRate ?? DEFAULT_INDEX_RATE;
  if (label.includes("protect voiceless")) return request.protect ?? DEFAULT_PROTECT;
  if (label === "pitch" || label.endsWith(" pitch")) return request.pitch ?? DEFAULT_PITCH;
  if (label.includes("autotune")) return request.autotune ?? false;

  const booleanControls = [
    "split audio",
    "proposed pitch",
    "clean audio",
    "formant shifting",
    "post-process",
    "reverb",
    "pitch shift",
    "limiter",
    "gain",
    "distortion",
    "chorus",
    "bitcrush",
    "clipping",
    "compressor",
    "delay",
  ];
  if (booleanControls.some((name) => label.includes(name))) return false;

  if (parameter.parameter_has_default) return parameter.parameter_default;
  throw new Error(`Applio API introduced an unsupported required input: ${label}`);
}

function findApplioEndpoint(api: {
  named_endpoints?: Record<string, { parameters: Array<Record<string, unknown>>; returns: Array<Record<string, unknown>> }>;
  unnamed_endpoints?: Record<string, { parameters: Array<Record<string, unknown>>; returns: Array<Record<string, unknown>> }>;
}) {
  const candidates = [
    ...Object.entries(api.named_endpoints ?? {}),
    ...Object.entries(api.unnamed_endpoints ?? {}),
  ];

  const candidate = candidates.find(([, endpoint]) => {
    const labels = endpoint.parameters.map((parameter) => labelFor(parameter));
    const returnsAudio = endpoint.returns.some((output) =>
      String(output.component ?? "").toLowerCase().includes("audio"),
    );
    return (
      labels.some((label) => label.includes("select audio")) &&
      labels.some((label) => label.includes("voice model")) &&
      labels.some((label) => label.includes("index file")) &&
      returnsAudio
    );
  });

  if (!candidate) {
    throw new Error("The current Applio Space does not expose a compatible RVC inference endpoint.");
  }

  return candidate;
}

function findAudioUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioUrl(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["url", "path"]) {
    if (typeof record[key] === "string" && /^https?:\/\//i.test(record[key])) {
      return record[key] as string;
    }
  }

  for (const nested of Object.values(record)) {
    const found = findAudioUrl(nested);
    if (found) return found;
  }
  return null;
}

export async function convertWithApplioSpace(
  request: ApplioConversionRequest & { hfToken?: string },
): Promise<Response> {
  if (!request.audio || request.audio.size < MIN_AUDIO_BYTES) {
    throw new Error("A non-empty source vocal is required for RVC conversion.");
  }
  if (!request.model) {
    throw new Error("An Applio RVC voice model is required.");
  }

  const app = await Client.connect(APPLIO_SPACE, {
    token: request.hfToken,
    analytics_enabled: false,
  });
  const api = await app.view_api();
  const [, endpoint] = findApplioEndpoint(api as Parameters<typeof findApplioEndpoint>[0]);
  const values = endpoint.parameters.map((parameter) =>
    valueForApplioParameter(parameter, request),
  );
  const endpointName = Object.entries(api.named_endpoints ?? {}).find(
    ([, candidate]) => candidate === endpoint,
  )?.[0];
  const result = endpointName
    ? await app.predict(endpointName, values)
    : await app.predict(Number(Object.entries(api.unnamed_endpoints ?? {}).find(([, candidate]) => candidate === endpoint)?.[0]), values);

  const audioUrl = findAudioUrl(result);
  if (!audioUrl) throw new Error("Applio completed without returning a playable audio artifact.");

  const response = await fetch(audioUrl);
  if (!(await validateApplioResponse(response))) {
    throw new Error("Applio returned an invalid audio artifact.");
  }
  return response;
}

export async function convertWithApplio({
  baseUrl,
  apiToken,
  ...request
}: ApplioConversionRequest & {
  baseUrl: string;
  apiToken?: string;
}): Promise<Response> {
  const url = `${normalizeApplioUrl(baseUrl)}/rvc/convert`;
  const headers = new Headers();
  if (apiToken) headers.set("Authorization", `Bearer ${apiToken}`);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: buildApplioFormData(request),
  });

  if (!(await validateApplioResponse(response))) {
    const detail = (await response.clone().text()).slice(0, 500);
    throw new Error(
      `Applio RVC conversion failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
    );
  }

  return response;
}
