import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

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

/**
 * Gradio Spaces are excellent free/open inference targets, but browser-to-Space
 * CORS and sleeping/ZeroGPU lifecycle behaviour can make a direct client
 * connection fail even when the Space itself is healthy. Keep the browser on
 * our own origin and proxy only the public Gradio HTTP surface upstream.
 * No provider secret is stored in the browser or forwarded automatically.
 */
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
    "range",
    "x-ip-token",
    "x-requested-with",
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
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-studio-upstream", space);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
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
