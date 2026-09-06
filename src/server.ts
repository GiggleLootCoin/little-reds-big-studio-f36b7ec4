import { handleVoiceClone } from "./lib/voice-clone-gateway";
import { getServerEntry } from "./server-entry";
import { consumeLastCapturedError, renderErrorPage } from "./lib/error-capture";

const AI_PREFIX = "/api/ai";

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status, headers: { "cache-control": "no-store" } });
}

function chatText(result: unknown): string {
  if (typeof result === "string") return result.trim();
  if (!result || typeof result !== "object") return "";
  const value = result as Record<string, unknown>;
  const direct = [value.response, value.text, value.output_text, value.content];
  for (const item of direct) if (typeof item === "string" && item.trim()) return item.trim();
  const choices = Array.isArray(value.choices) ? value.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (message && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string" && content.trim()) return content.trim();
    }
    const text = (choice as Record<string, unknown>).text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return "";
}

function isCapacityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /capacity|rate.?limit|too many requests|overloaded|queue is full|service unavailable/i.test(message);
}

async function openRouterChat(env: ServerEnv, messages: unknown[]) {
  const token = env.OPENROUTER_API_KEY?.trim();
  if (!token) throw new Error("OpenRouter fallback is not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev",
      "X-Title": "Little Red's Big Studio",
    },
    body: JSON.stringify({ model: "qwen/qwen3-30b-a3b:free", messages }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`OpenRouter chat failed (${response.status}). ${detail}`.trim());
  }
  return response.json();
}

function ttsLanguage(language?: string): string {
  const normalized = String(language || "English").trim().toLowerCase();
  if (normalized.startsWith("es") || normalized === "spanish") return "es";
  return "en";
}

async function rawAudioResponse(result: unknown): Promise<Response | null> {
  if (result instanceof ArrayBuffer) return new Response(result, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  if (result instanceof Uint8Array) return new Response(result, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  if (result && typeof result === "object" && "body" in result && (result as { body?: unknown }).body instanceof ReadableStream)
    return new Response((result as { body: ReadableStream }).body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  return null;
}

type ServerEnv = {
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
  OPENROUTER_API_KEY?: string;
};

const AURA_EN_SPEAKERS = new Set([
  "asteria",
  "athena",
  "atlas",
  "cassiopeia",
  "celeste",
  "charon",
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
  const pathCapability = url.pathname.startsWith(`${AI_PREFIX}/`) ? url.pathname.slice(`${AI_PREFIX}/`.length).split("/")[0].trim() : "";
  const capability = String(body.capability || pathCapability).trim();
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
        result = await env.AI.run("@cf/openai/whisper", input);
      } catch (primaryError) {
        console.warn("Standard Whisper failed; retrying with its binary-input form", primaryError);
        try {
          result = await env.AI.run("@cf/openai/whisper", audio);
        } catch (secondaryError) {
          console.warn("Standard Whisper binary request failed", secondaryError);
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
    if (capability === "web-search") {
      if (!body.searchQuery?.trim()) return jsonError("Search query is required.", 400);
      const query = encodeURIComponent(body.searchQuery.trim());
      const response = await fetch(`https://r.jina.ai/http://www.google.com/search?q=${query}`, {
        headers: { "user-agent": "LittleRedsBigStudio/1.0" },
      });
      if (!response.ok) return jsonError("Web search temporarily unavailable.", 503);
      const text = await response.text();
      return Response.json({ text }, { headers: { "cache-control": "no-store" } });
    }
    if (capability === "chat") {
      const messages = Array.isArray(body.messages) && body.messages.length
        ? body.messages
        : [{ role: "user", content: prompt }];
      const result = await openRouterChat(env, messages);
      const text = chatText(result);
      if (!text) return jsonError("The AI returned no usable response.", 502);
      return Response.json({ text }, { headers: { "cache-control": "no-store" } });
    }
    if (capability === "tts") {
      const requestedSpeaker = String(body.speaker || "").trim();
      const speaker = BUDDY_TO_AURA[requestedSpeaker] || "luna";
      const language = ttsLanguage(body.language);
      if (language !== "en") {
        if (language === "es") {
          const spanishSpeaker = AURA_ES_SPEAKERS.has(requestedSpeaker.toLowerCase())
            ? requestedSpeaker.toLowerCase()
            : "sirio";
          const result = await env.AI.run("@cf/deepgram/aura-2-es", {
            text: prompt,
            speaker: spanishSpeaker,
            encoding: "mp3",
          });
          const audio = await rawAudioResponse(result);
          if (!audio) return jsonError("The speech model returned no audio.", 502);
          return audio;
        }
        return jsonError("Buddy preset voices currently support English and Spanish only.", 400);
      }
      if (!AURA_EN_SPEAKERS.has(speaker))
        return jsonError("Selected Buddy preset is not a valid Aura-2 English speaker.", 400);
      const result = await env.AI.run("@cf/deepgram/aura-2-en", {
        text: prompt,
        speaker,
        encoding: "mp3",
      });
      const audio = await rawAudioResponse(result);
      if (!audio) return jsonError("The speech model returned no audio.", 502);
      return audio;
    }
    if (capability === "image") {
      const result = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
        prompt,
        num_steps: 20,
      });
      const image = await rawImageResponse(result);
      if (!image) return jsonError("The image model returned no image.", 502);
      return image;
    }
    if (capability === "video") {
      const result = await env.AI.run("@cf/bytedance/seedance-1.0-lite", {
        prompt,
        duration: Math.max(2, Math.min(5, Math.round(body.duration || 4))),
        aspect_ratio: body.aspectRatio || "16:9",
        resolution: body.resolution || "720p",
      });
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }
    if (capability === "music") {
      const result = await env.AI.run("@cf/meta/musicgen-1", {
        prompt,
        duration: Math.max(1, Math.min(30, Math.round(body.duration || 8))),
      });
      const audio = await rawAudioResponse(result);
      if (!audio) return jsonError("The music model returned no audio.", 502);
      return audio;
    }
    if (capability === "instrumental") {
      const result = await env.AI.run("@cf/meta/musicgen-1", {
        prompt: `${prompt}\nInstrumental only. No vocals.`,
        duration: Math.max(1, Math.min(30, Math.round(body.duration || 8))),
      });
      const audio = await rawAudioResponse(result);
      if (!audio) return jsonError("The instrumental model returned no audio.", 502);
      return audio;
    }
    return jsonError(`Unsupported capability: ${capability}`, 400);
  } catch (error) {
    console.error("Cloudflare AI route failed", error);
    return jsonError(error instanceof Error ? error.message : "Cloudflare AI request failed.", 502);
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const voice = await (handleVoiceClone as unknown as (request: Request, env: unknown) => Promise<Response | null>)(request, env);
      if (voice) return voice;
      const ai = await cloudflareAI(request, env as ServerEnv);
      if (ai) return ai;
      const proxied = await proxyHfSpace(request);
      if (proxied) return proxied;
      const entry = await getServerEntry();
      return entry.fetch(request, env, ctx);
    } catch (error) {
      const captured = consumeLastCapturedError();
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
