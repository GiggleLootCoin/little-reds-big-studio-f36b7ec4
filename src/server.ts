import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type WorkersAI = {
  run: (model: string, input: unknown) => Promise<unknown>;
};
type ServerEnv = { AI?: WorkersAI };
type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
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
    const chunk = 0x8000;
    for (let i = 0; i < value.length; i += chunk)
      binary += String.fromCharCode(...value.subarray(i, i + chunk));
    return btoa(binary);
  }
  if (value && typeof value === "object") {
    for (const key of ["image", "audio", "data", "result", "output"]) {
      const found = asBase64((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return null;
}

async function cloudflareAI(request: Request, env: ServerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(AI_PREFIX)) return null;
  if (!env.AI) return jsonError("Cloudflare Workers AI binding is not configured.", 503);
  if (request.method !== "POST") return jsonError("POST required.", 405);
  let body: { capability?: string; prompt?: string; language?: string; messages?: unknown[] };
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
        {
          headers: { "content-type": "image/png", "cache-control": "no-store" },
        },
      );
    }

    if (capability === "tts") {
      const result = await env.AI.run("@cf/myshell-ai/melotts", {
        prompt,
        lang: body.language || "en",
      });
      if (result instanceof Response) {
        const headers = new Headers(result.headers);
        headers.set("cache-control", "no-store");
        return new Response(result.body, { status: result.status, headers });
      }
      const base64 = asBase64(result);
      if (!base64) return jsonError("TTS model returned no usable audio.");
      return new Response(
        Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        {
          headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
        },
      );
    }

    if (capability === "chat") {
      const messages =
        Array.isArray(body.messages) && body.messages.length
          ? body.messages
          : [{ role: "user", content: prompt }];
      const result = await env.AI.run("@cf/qwen/qwen3-30b-a3b-fp8", { messages, max_tokens: 1024 });
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
