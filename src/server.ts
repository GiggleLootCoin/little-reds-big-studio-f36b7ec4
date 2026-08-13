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
  if (typeof value === "string" && !/^https?:\/\//i.test(value)) return value;
  if (value instanceof Uint8Array) {
    let binary = "";
    for (let i = 0; i < value.length; i += 0x8000)
      binary += String.fromCharCode(...value.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  if (value && typeof value === "object")
    for (const key of ["image", "audio", "data", "result", "output", "image_b64"]) {
      const found = asBase64((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  return null;
}
function mediaUrl(value: unknown, keys: string[]): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === "object")
    for (const key of keys) {
      const found = mediaUrl((value as Record<string, unknown>)[key], keys);
      if (found) return found;
    }
  return null;
}
function fromBase64(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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
  if (result instanceof ReadableStream)
    return new Response(result, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  if (typeof result === "string" && /^https?:\/\//i.test(result)) {
    const upstream = await fetch(result);
    if (!upstream.ok) return null;
    const headers = new Headers(upstream.headers);
    headers.set("cache-control", "no-store");
    if (!headers.get("content-type")) headers.set("content-type", "audio/mpeg");
    return new Response(upstream.body, { status: upstream.status, headers });
  }
  if (result && typeof result === "object")
    for (const key of ["audio", "url", "uri", "result", "output"]) {
      const response = await rawAudioResponse((result as Record<string, unknown>)[key]);
      if (response) return response;
    }
  const base64 = asBase64(result);
  if (!base64) return null;
  return new Response(fromBase64(base64), {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
}
async function rawImageResponse(result: unknown): Promise<Response | null> {
  if (result instanceof Response) {
    if (!result.ok) return result;
    const headers = new Headers(result.headers);
    headers.set("content-type", headers.get("content-type") || "image/png");
    headers.set("cache-control", "no-store");
    return new Response(result.body, { status: result.status, headers });
  }
  if (result instanceof ReadableStream)
    return new Response(result, {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  if (
    result &&
    typeof result === "object" &&
    typeof (result as Record<string, unknown>).image === "string"
  )
    return new Response(fromBase64(String((result as Record<string, unknown>).image)), {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  const base64 = asBase64(result);
  if (!base64) return null;
  return new Response(fromBase64(base64), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
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
function chatText(result: unknown): string {
  if (typeof result === "string") return result.trim();
  if (result && typeof result === "object") {
    for (const key of ["response", "text", "generated_text", "output", "content"]) {
      const value = (result as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const choices = (result as Record<string, unknown>).choices;
    if (Array.isArray(choices)) {
      const content = (choices[0] as Record<string, unknown> | undefined)?.message;
      if (
        content &&
        typeof content === "object" &&
        typeof (content as Record<string, unknown>).content === "string"
      )
        return String((content as Record<string, unknown>).content).trim();
    }
  }
  return "";
}
async function cloudflareAI(request: Request, env: ServerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(AI_PREFIX)) return null;
  if (!env.AI) return jsonError("Cloudflare Workers AI binding is not configured.", 503);
  if (request.method !== "POST") return jsonError("POST required.", 405);
  let body: {
    capability?: string;
    prompt?: string;
    text?: string;
    lyrics?: string;
    language?: string;
    messages?: unknown[];
    speaker?: string;
    audioBase64?: string;
    image?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    instrumental?: boolean;
    lyricsOptimizer?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request.", 400);
  }
  const capability = body.capability ?? "";
  const prompt = String(body.prompt ?? body.text ?? body.lyrics ?? "").trim();
  if (!prompt && !["speech-to-text", "video"].includes(capability))
    return jsonError("Prompt is required.", 400);
  try {
    if (capability === "speech-to-text") {
      if (!body.audioBase64) return jsonError("Audio is required for speech recognition.", 400);
      const audio = fromBase64(body.audioBase64);
      if (!audio.byteLength) return jsonError("The recorded audio was empty.", 400);
      const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", audio);
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }
    if (capability === "image") {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("width", "1024");
      form.append("height", "768");
      const formResponse = new Response(form);
      const result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", {
        multipart: {
          body: formResponse.body,
          contentType: formResponse.headers.get("content-type") || "multipart/form-data",
        },
      });
      const image = await rawImageResponse(result);
      if (!image) return jsonError("Image model returned no usable image.", 502);
      return image;
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
        if (!isCapacityError(error)) console.warn("MeloTTS failed; trying Aura-2", error);
      }
      try {
        const aura = await env.AI.run("@cf/deepgram/aura-2-en", {
          text: prompt,
          encoding: "mp3",
          speaker: body.speaker || "luna",
        });
        const audio = await rawAudioResponse(aura);
        if (audio) return audio;
      } catch (error) {
        console.warn("Aura-2 failed; trying Aura-1", error);
      }
      const aura1 = await env.AI.run("@cf/deepgram/aura-1", {
        text: prompt,
        encoding: "mp3",
        speaker: body.speaker || "asteria",
      });
      const audio = await rawAudioResponse(aura1);
      if (!audio) return jsonError("TTS providers returned no usable audio.", 502);
      return audio;
    }
    if (capability === "chat") {
      const messages =
        Array.isArray(body.messages) && body.messages.length
          ? body.messages
          : [{ role: "user", content: prompt }];
      const model = hasImageContent(messages)
        ? "@cf/google/gemma-4-26b-a4b-it"
        : "@cf/qwen/qwen3-30b-a3b-fp8";
      let result: unknown;
      try {
        result = await env.AI.run(model, { messages, max_tokens: 1024, temperature: 0.6 });
      } catch (primaryError) {
        console.warn("Primary Buddy model failed; using GPT-OSS fallback", primaryError);
        result = await env.AI.run("@cf/openai/gpt-oss-20b", {
          messages,
          max_tokens: 1024,
          temperature: 0.6,
        });
      }
      const text = chatText(result);
      if (!text) return jsonError("Buddy model returned no usable response.", 502);
      return Response.json(
        { response: text, text, result },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (capability === "music") {
      const result = await env.AI.run("minimax/music-2.6", {
        prompt: prompt.slice(0, 2000),
        lyrics: body.lyrics || undefined,
        is_instrumental: Boolean(body.instrumental),
        lyrics_optimizer: body.lyricsOptimizer ?? !body.lyrics,
      });
      const audio = mediaUrl(result, ["audio", "url", "uri", "result", "output"]);
      if (!audio) return jsonError("Music model returned no usable audio URL.", 502);
      return Response.json(
        { audio, provider: "MiniMax Music 2.6" },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (capability === "video") {
      const result = await env.AI.run("bytedance/seedance-2.0-fast", {
        prompt: prompt || "Create a cinematic short video",
        duration: Math.min(12, Math.max(4, Number(body.duration) || 5)),
        resolution: body.resolution || "720p",
        aspect_ratio: body.aspectRatio || "16:9",
        fps: 24,
        generate_audio: true,
        watermark: false,
        use_virtual_avatar: false,
        ...(body.image ? { image: body.image } : {}),
      });
      const video = mediaUrl(result, ["video", "url", "uri", "result", "output"]);
      if (!video) return jsonError("Video model returned no usable video URL.", 502);
      return Response.json(
        { video, provider: "Seedance 2.0 Fast" },
        { headers: { "cache-control": "no-store" } },
      );
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
