import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type WorkersAI = { run: (model: string, input: unknown, options?: unknown) => Promise<unknown> };
type ServerEnv = { AI?: WorkersAI };
type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};
let serverEntryPromise: Promise<ServerEntry> | undefined;
async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise)
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  return serverEntryPromise;
}
const HF_PROXY_PREFIX = "/api/hf-space/";
const AI_PREFIX = "/api/ai/";
const HF_SPACE_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
function decodeSpaceToken(token: string) {
  try {
    return decodeURIComponent(token);
  } catch {
    return "";
  }
}
function encodeSpaceToken(space: string) {
  return encodeURIComponent(space);
}
async function proxyHfSpace(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(HF_PROXY_PREFIX)) return null;
  const rest = url.pathname.slice(HF_PROXY_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash < 1) return new Response("Missing Space", { status: 400 });
  const space = decodeSpaceToken(rest.slice(0, slash));
  if (!HF_SPACE_RE.test(space)) return new Response("Invalid Space", { status: 400 });
  const upstreamPath = rest.slice(slash) || "/";
  const upstream = new URL(`https://${space.replace("/", "-")}.hf.space${upstreamPath}`);
  upstream.search = url.search;
  const headers = new Headers();
  for (const name of [
    "accept",
    "accept-language",
    "authorization",
    "content-type",
    "cookie",
    "origin",
    "range",
    "referer",
    "user-agent",
    "x-ip-token",
    "x-requested-with",
    "upgrade",
    "connection",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-protocol",
    "sec-websocket-extensions",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstreamResponse = await fetch(upstream, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  });
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-security-policy");
  responseHeaders.delete("content-encoding");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-studio-upstream", space);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
function jsonError(message: string, status = 500) {
  return Response.json(
    { ok: false, error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}
function asBase64(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) {
    let binary = "";
    for (let i = 0; i < value.length; i += 0x8000)
      binary += String.fromCharCode(...value.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  if (value && typeof value === "object")
    for (const key of ["image", "audio", "data", "result", "output"]) {
      const found = asBase64((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  return null;
}
function isCapacityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("3040") || message.toLowerCase().includes("capacity temporarily exceeded")
  );
}
async function rawAudioResponse(result: unknown): Promise<Response | null> {
  if (result instanceof Response) {
    if (!result.ok) return result;
    const headers = new Headers(result.headers);
    headers.set("cache-control", "no-store");
    if (!headers.get("content-type")) headers.set("content-type", "audio/mpeg");
    return new Response(result.body, { status: result.status, headers });
  }
  const base64 = asBase64(result);
  if (!base64) return null;
  return new Response(
    Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } },
  );
}
function hasImageContent(messages: unknown[]) {
  return messages.some(
    (message) =>
      Array.isArray((message as { content?: unknown })?.content) &&
      (message as { content: unknown[] }).content.some(
        (part) => (part as { type?: string })?.type === "image_url",
      ),
  );
}
async function cloudflareAI(request: Request, env: ServerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(AI_PREFIX)) return null;
  if (!env.AI) return jsonError("Cloudflare Workers AI binding is not configured.", 503);
  if (request.method !== "POST") return jsonError("POST required.", 405);
  let body: {
    capability?: string;
    prompt?: string;
    language?: string;
    messages?: unknown[];
    speaker?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request.", 400);
  }
  const capability = body.capability ?? "";
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt && capability !== "speech-to-text") return jsonError("Prompt is required.", 400);
  try {
    if (capability === "image") {
      const result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-9b", {
        prompt,
        width: 1024,
        height: 768,
      });
      const base64 = asBase64(result);
      if (!base64) return jsonError("Image model returned no usable image.");
      return new Response(
        Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        { headers: { "content-type": "image/png", "cache-control": "no-store" } },
      );
    }
    if (capability === "tts") {
      try {
        const result = await env.AI.run("@cf/myshell-ai/melotts", {
          prompt,
          lang: body.language || "en",
        });
        const audio = await rawAudioResponse(result);
        if (audio) return audio;
      } catch (error) {
        if (!isCapacityError(error)) console.warn("MeloTTS failed; trying Aura-1", error);
      }
      const aura = await env.AI.run(
        "@cf/deepgram/aura-1",
        { text: prompt, encoding: "mp3", speaker: body.speaker || "asteria" },
        { returnRawResponse: true },
      );
      const audio = await rawAudioResponse(aura);
      if (!audio) return jsonError("TTS providers returned no usable audio.");
      return audio;
    }
    if (capability === "chat") {
      const messages =
        Array.isArray(body.messages) && body.messages.length
          ? body.messages
          : [{ role: "user", content: prompt }];
      // Qwen3 is retained for ordinary text chat. Gemma 4 is the current Cloudflare
      // vision-capable route for messages containing image_url parts.
      const model = hasImageContent(messages)
        ? "@cf/google/gemma-4-26b-a4b-it"
        : "@cf/qwen/qwen3-30b-a3b-fp8";
      const result = await env.AI.run(model, { messages, max_tokens: 1024 });
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }
    return jsonError(`Cloudflare AI does not provide the ${capability} capability.`, 400);
  } catch (error) {
    console.error("Workers AI generation failed", error);
    return jsonError(error instanceof Error ? error.message : "Workers AI generation failed.");
  }
}
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;
  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;
  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const cloudflare = await cloudflareAI(request, env as ServerEnv);
      if (cloudflare) return cloudflare;
      const proxied = await proxyHfSpace(request);
      if (proxied) return proxied;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
export { encodeSpaceToken };
