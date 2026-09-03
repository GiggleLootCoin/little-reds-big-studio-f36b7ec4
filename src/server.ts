import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleVoiceClone } from "./lib/voice-clone-gateway";

type WorkersAI = { run: (model: string, input: unknown, options?: unknown) => Promise<unknown> };
type ServerEnv = {
  AI?: WorkersAI;
  OPENROUTERAI_API_KEY?: string;
  HF_TOKEN?: string;
  QWEN_TTS_SPACE_URL?: string;
};
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
const VOICE_CLONE_PATH = "/api/voice-clone";
const HF_SPACE_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const WEB_SEARCH_PATH = "/api/ai/web-search/";
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
    message.includes("3040") ||
    message.toLowerCase().includes("capacity temporarily exceeded") ||
    message.toLowerCase().includes("out of capacity")
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
async function openRouterChat(env: ServerEnv, messages: unknown[]): Promise<unknown> {
  const key = env.OPENROUTERAI_API_KEY?.trim();
  if (!key) throw new Error("OpenRouter API key is not configured");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://little-reds-big-studio-f36b7ec4.workers.dev",
      "X-Title": "Buddy AI",
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages,
      max_tokens: 640,
      temperature: 0.6,
    }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payloadRecord =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const detail = payloadRecord?.error
      ? JSON.stringify(payloadRecord.error)
      : `HTTP ${response.status}`;
    throw new Error(`OpenRouter request failed: ${detail}`);
  }
  return payload;
}
function ttsLanguage(value: string | undefined): string {
  const raw = String(value || "en")
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    english: "en",
    en: "en",
    spanish: "es",
    es: "es",
    french: "fr",
    fr: "fr",
    german: "de",
    de: "de",
    italian: "it",
    it: "it",
    portuguese: "pt",
    pt: "pt",
    chinese: "zh",
    mandarin: "zh",
    zh: "zh",
    japanese: "ja",
    ja: "ja",
    korean: "ko",
    ko: "ko",
    hindi: "hi",
    hi: "hi",
    arabic: "ar",
    ar: "ar",
  };
  return map[raw] || raw.split(/[-_]/)[0] || "en";
}
const AURA_EN_SPEAKERS = new Set([
  "amalthea",
  "andromeda",
  "apollo",
  "arcas",
  "aries",
  "asteria",
  "athena",
  "atlas",
  "aurora",
  "callista",
  "cora",
  "cordelia",
  "delia",
  "draco",
  "electra",
  "harmonia",
  "helena",
  "hera",
  "hermes",
  "hyperion",
  "iris",
  "janus",
  "juno",
  "jupiter",
  "luna",
  "mars",
  "minerva",
  "neptune",
  "odysseus",
  "ophelia",
  "orion",
  "orpheus",
  "pandora",
  "phoebe",
  "pluto",
  "saturn",
  "thalia",
  "theia",
  "vesta",
  "zeus",
]);
const AURA_ES_SPEAKERS = new Set([
  "sirio",
  "nestor",
  "carina",
  "celeste",
  "alvaro",
  "diana",
  "aquila",
  "selena",
  "estrella",
  "javier",
]);
const BUDDY_TO_AURA: Record<string, string> = {
  Ryan: "luna",
  Aiden: "orpheus",
  Vivian: "athena",
  Serena: "asteria",
  Uncle_Fu: "atlas",
  Dylan: "juno",
  Eric: "zeus",
  Ono_Anna: "phoebe",
  Sohee: "delia",
};
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
    searchQuery?: string;
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
      const audio = body.audioBase64.trim();
      if (!audio) return jsonError("The recorded audio was empty.", 400);
      const input = {
        audio,
        task: "transcribe",
        ...(body.language && body.language !== "Auto" ? { language: body.language } : {}),
        vad_filter: true,
      };
      let result: unknown;
      try {
        result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", input);
      } catch (primaryError) {
        console.warn("Whisper Turbo failed; trying standard Whisper", primaryError);
        try {
          result = await env.AI.run("@cf/openai/whisper", audio);
        } catch (secondaryError) {
          console.warn("Standard Whisper failed", secondaryError);
          return jsonError(
            `Speech recognition temporarily unavailable. ${isCapacityError(primaryError) || isCapacityError(secondaryError) ? "The AI service is at capacity." : "The audio request was rejected."}`,
            503,
          );
        }
      }
      const text = chatText(result);
      if (!text) return jsonError("Whisper returned no usable transcription.", 502);
      return Response.json(
        { text, transcription: text },
        { headers: { "cache-control": "no-store" } },
      );
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
      const lang = ttsLanguage(body.language);
      const requested = String(body.speaker || "").trim();
      const auraSpeaker = BUDDY_TO_AURA[requested] || requested.toLowerCase();
      let lastError: unknown;
      if (lang === "en" && AURA_EN_SPEAKERS.has(auraSpeaker)) {
        try {
          const aura = await env.AI.run("@cf/deepgram/aura-2-en", {
            text: prompt,
            encoding: "mp3",
            speaker: auraSpeaker,
          });
          const audio = await rawAudioResponse(aura);
          if (audio) return audio;
          lastError = new Error("Aura-2 English returned no audio");
        } catch (error) {
          lastError = error;
          console.warn("Aura-2 English failed", error);
        }
      }
      if (lang === "es" && AURA_ES_SPEAKERS.has(auraSpeaker)) {
        try {
          const aura = await env.AI.run("@cf/deepgram/aura-2-es", {
            text: prompt,
            encoding: "mp3",
            speaker: auraSpeaker,
          });
          const audio = await rawAudioResponse(aura);
          if (audio) return audio;
          lastError = new Error("Aura-2 Spanish returned no audio");
        } catch (error) {
          lastError = error;
          console.warn("Aura-2 Spanish failed", error);
        }
      }
      try {
        const result = await env.AI.run("@cf/myshell-ai/melotts", { prompt, lang });
        const audio = await rawAudioResponse(result);
        if (audio) return audio;
        lastError = new Error("MeloTTS returned no audio");
      } catch (error) {
        lastError = error;
        console.warn("MeloTTS failed", error);
      }
      return jsonError(
        `TTS returned no usable audio.${isCapacityError(lastError) ? " The AI service is at capacity." : ""}`,
        503,
      );
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
      const chatOptions = {
        messages,
        max_tokens: 640,
        temperature: 0.6,
        chat_template_kwargs: { enable_thinking: false },
      };
      try {
        result = await env.AI.run(model, chatOptions);
      } catch (primaryError) {
        console.warn("Primary Buddy model failed; trying OpenRouter", primaryError);
        try {
          result = await openRouterChat(env, messages);
        } catch (openRouterError) {
          console.warn("OpenRouter fallback failed; using GPT-OSS fallback", openRouterError);
          result = await env.AI.run("@cf/openai/gpt-oss-20b", {
            messages,
            max_tokens: 640,
            temperature: 0.6,
          });
        }
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
        lyrics: body.lyrics?.trim() || undefined,
        is_instrumental: Boolean(body.instrumental),
        lyrics_optimizer: body.lyricsOptimizer ?? !body.lyrics?.trim(),
        format: "mp3",
      });
      const audio = await rawAudioResponse(result);
      if (!audio) return jsonError("MiniMax Music 2.6 returned no playable audio.", 502);
      const headers = new Headers(audio.headers);
      headers.set("cache-control", "no-store");
      headers.set("x-music-provider", "MiniMax Music 2.6");
      return new Response(audio.body, { status: 200, headers });
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
    if (capability === "web-search") {
      const query = String(body.prompt ?? body.text ?? body.searchQuery ?? "").trim();
      if (!query) return jsonError("Search query is required.", 400);
      const results = await webSearch(query);
      return Response.json(
        { query, results, provider: "DuckDuckGo" },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return jsonError(`Cloudflare AI does not provide the ${capability} capability.`, 400);
  } catch (error) {
    console.error("Workers AI generation failed", error);
    return jsonError(error instanceof Error ? error.message : "Workers AI generation failed.");
  }
}

async function webSearch(
  query: string,
): Promise<{ title: string; url: string; snippet: string }[]> {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  url.searchParams.set("kl", "us-en");
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; LittleRedsBigStudio/1.0; +https://gigglelootcoin.workers.dev)",
      accept: "text/html",
    },
  });
  if (!response.ok) throw new Error(`Web search failed (${response.status}).`);
  const html = await response.text();
  const results: { title: string; url: string; snippet: string }[] = [];
  const itemRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(html)) && results.length < 8) {
    const decode = (s: string) =>
      s.replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    results.push({ title: decode(match[2]), url: match[1], snippet: decode(match[3]) });
  }
  return results;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const voice = await handleVoiceClone(request, env as Parameters<typeof handleVoiceClone>[1]);
      if (voice) return voice;
      const ai = await cloudflareAI(request, env as ServerEnv);
      if (ai) return ai;
      const proxied = await proxyHfSpace(request);
      if (proxied) return proxied;
      const entry = await getServerEntry();
      return entry.fetch(request, env, ctx);
    } catch (error) {
      const captured = consumeLastCapturedError();
      return new Response(renderErrorPage(captured || error), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
