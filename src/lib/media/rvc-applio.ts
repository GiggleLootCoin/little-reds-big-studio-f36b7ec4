export type ApplioConversionRequest = {
  audio: File | Blob;
  model?: string;
  index?: string;
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
  if (input.model) form.set("model", input.model);
  if (input.index) form.set("index", input.index);
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
