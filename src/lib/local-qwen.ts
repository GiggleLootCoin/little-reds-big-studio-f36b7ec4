export type LocalQwenMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LocalQwenOptions = {
  messages: LocalQwenMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type LocalQwenResult = {
  text: string;
  provider: "Local Qwen";
  model: string;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_MODEL = "Qwen3";
const DEFAULT_TIMEOUT_MS = 12000;
const ENABLE_KEY = "buddy.localQwen.enabled";
const URL_KEY = "buddy.localQwen.url";
const MODEL_KEY = "buddy.localQwen.model";

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function configuredUrl(): string {
  const storage = browserStorage();
  const saved = storage?.getItem(URL_KEY)?.trim();
  if (saved) return saved;
  const env = typeof import.meta !== "undefined" ? import.meta.env?.VITE_LOCAL_QWEN_URL : undefined;
  return typeof env === "string" && env.trim() ? env.trim() : DEFAULT_BASE_URL;
}

export function normalizeLocalQwenUrl(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error("Local Qwen URL is empty.");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  const path = url.pathname.replace(/\/+$/, "");
  if (/\/v1\/chat\/completions$/i.test(path)) return url.toString().replace(/\/$/, "");
  if (/\/v1$/i.test(path)) {
    url.pathname = `${path}/chat/completions`;
  } else {
    url.pathname = `${path}/v1/chat/completions`;
  }
  return url.toString().replace(/\/$/, "");
}

export function isLocalQwenEnabled(): boolean {
  const storage = browserStorage();
  if (storage?.getItem(ENABLE_KEY) === "false") return false;
  if (storage?.getItem(ENABLE_KEY) === "true") return true;
  return typeof window !== "undefined";
}

export function localQwenModel(): string {
  const storage = browserStorage();
  return storage?.getItem(MODEL_KEY)?.trim() || DEFAULT_MODEL;
}

export function extractLocalQwenText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const item = part as { text?: unknown };
          return typeof item.text === "string" ? item.text : "";
        })
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

function abortableFetch(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function runLocalQwen(options: LocalQwenOptions): Promise<LocalQwenResult> {
  if (!isLocalQwenEnabled()) throw new Error("Local Qwen is disabled.");
  if (!options.messages.length) throw new Error("Local Qwen requires at least one message.");

  const model = options.model?.trim() || localQwenModel();
  const timeoutMs = Math.max(1500, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const response = await abortableFetch(
    normalizeLocalQwenUrl(configuredUrl()),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxTokens ?? 700,
        stream: false,
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`Local Qwen HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const value = (await response.json()) as unknown;
  const text = extractLocalQwenText(value);
  if (!text) throw new Error("Local Qwen returned no assistant text.");
  return { text, provider: "Local Qwen", model };
}

export function localQwenBaseUrl(): string {
  return configuredUrl();
}

export const LOCAL_QWEN_DEFAULTS = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
} as const;
