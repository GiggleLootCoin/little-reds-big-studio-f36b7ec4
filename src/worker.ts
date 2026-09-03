import studioServer from "./server";
import { handleProductionVoiceClone, voiceCloneHealth } from "./lib/production-voice-clone";
import { normalizeSpeechLanguage } from "./lib/speech-language.mjs";

type WorkersAIResult = Record<string, unknown> | string | unknown[] | null;
type WorkersAI = {
  run: (model: string, input: unknown, options?: unknown) => Promise<WorkersAIResult>;
};
type Env = {
  AI?: WorkersAI;
  HF_TOKEN?: string;
  CHATTERBOX_ENDPOINT?: string;
  CHATTERBOX_TOKEN?: string;
};

type ChatMessage = { role?: string; content?: unknown; [key: string]: unknown };

function jsonError(message: string, status = 500) {
  return Response.json(
    { ok: false, error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}
function chatText(result: WorkersAIResult): string {
  if (typeof result === "string") return result.trim();
  if (!result || typeof result !== "object" || Array.isArray(result)) return "";
  const record = result as Record<string, unknown>;
  for (const key of ["response", "text", "generated_text", "output", "content"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  const choices = record.choices;
  const message =
    Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>).message
      : undefined;
  return message &&
    typeof message === "object" &&
    typeof (message as Record<string, unknown>).content === "string"
    ? String((message as Record<string, unknown>).content).trim()
    : "";
}
function mediaUrl(result: unknown): string | null {
  if (typeof result === "string" && /^https?:\/\//i.test(result)) return result;
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  for (const key of ["audio", "url", "uri", "result", "output"]) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    const nested = mediaUrl(value);
    if (nested) return nested;
  }
  return null;
}

const PRESET_SPEAKERS: Record<string, string> = {
  Ryan: "angus",
  Aiden: "orion",
  Vivian: "asteria",
  Serena: "luna",
  Uncle_Fu: "zeus",
  Dylan: "perseus",
  Eric: "helios",
  Ono_Anna: "stella",
  Sohee: "athena",
};

async function reliablePresetTTS(request: Request, env: Env): Promise<Response> {
  if (!env.AI) return jsonError("Cloudflare Workers AI binding is not configured.", 503);
  let body: { text?: string; target_text?: string; prompt?: string; speaker?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid voice request.", 400);
  }
  const text = String(body.text || body.target_text || body.prompt || "").trim().slice(0, 1200);
  if (!text) return jsonError("Voice text is empty.", 400);
  const requested = String(body.speaker || "Ryan").trim();
  const speaker = PRESET_SPEAKERS[requested];
  if (!speaker) return jsonError(`Unsupported Buddy preset voice: ${requested}`, 400);
  const language = normalizeSpeechLanguage(body.language) || "en";
  try {
    const result = await env.AI.run(
      "@cf/deepgram/aura-1",
      { text, speaker, language },
      { returnRawResponse: true },
    );
    if (!(result instanceof Response)) throw new Error("Aura-1 did not return an audio response.");
    if (!result.ok) throw new Error(`Aura-1 returned HTTP ${result.status}.`);
    const headers = new Headers(result.headers);
    headers.set("content-type", headers.get("content-type") || "audio/mpeg");
    headers.set("cache-control", "no-store");
    headers.set("x-buddy-voice", requested);
    headers.set("x-buddy-voice-engine", "Cloudflare Workers AI Deepgram Aura-1");
    return new Response(result.body, { status: result.status, headers });
  } catch (error) {
    console.error("Buddy preset TTS failed", error);
    return jsonError(
      `Buddy preset voice generation failed. ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }
}

async function reliableSpeechToText(request: Request, env: Env): Promise<Response> {
  if (!env.AI) return jsonError("Cloudflare Workers AI binding is not configured.", 503);
  let body: { audioBase64?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid speech request.", 400);
  }
  const audio = String(body.audioBase64 || "").trim();
  if (!audio) return jsonError("Audio is required for speech recognition.", 400);
  const language = normalizeSpeechLanguage(body.language);
  let firstError: unknown;
  try {
    const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio,
      task: "transcribe",
      ...(language ? { language } : {}),
      vad_filter: false,
    });
    const text = chatText(result);
    if (text) return Response.json({ text, transcription: text });
    firstError = new Error("Whisper Turbo returned no transcription text.");
  } catch (error) {
    firstError = error;
  }
  try {
    const result = await env.AI.run("@cf/openai/whisper", audio);
    const text = chatText(result);
    if (text) return Response.json({ text, transcription: text });
    throw new Error("Whisper returned no transcription text.");
  } catch (secondError) {
    console.error("Reliable STT failed", firstError, secondError);
    return jsonError(
      "Speech recognition could not produce a result. Please try speaking for a little longer.",
      503,
    );
  }
}
async function reliableChat(request: Request, env: Env): Promise<Response> {
  if (!env.AI) return jsonError("Cloudflare Workers AI binding is not configured.", 503);
  let body: { messages?: unknown[]; prompt?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid chat request.", 400);
  }
  const messages =
    Array.isArray(body.messages) && body.messages.length
      ? body.messages
      : [{ role: "user", content: String(body.prompt || body.text || "").trim() }];
  if (!messages.length) return jsonError("A message is required.", 400);
  try {
    const result = await env.AI.run("@cf/qwen/qwen3-30b-a3b-fp8", {
      messages,
      max_tokens: 1024,
      temperature: 0.6,
    });
    const text = chatText(result);
    if (text) return Response.json({ response: text, text, result });
    throw new Error("Qwen3 returned no usable response.");
  } catch (qwenError) {
    console.warn("Direct Qwen chat failed; trying GPT-OSS", qwenError);
    try {
      const result = await env.AI.run("@cf/openai/gpt-oss-20b", {
        messages,
        max_tokens: 1024,
        temperature: 0.6,
      });
      const text = chatText(result);
      if (text) return Response.json({ response: text, text, result });
      throw new Error("GPT-OSS returned no usable response.");
    } catch (fallbackError) {
      console.error("Reliable Buddy chat failed", qwenError, fallbackError);
      return jsonError("Buddy could not produce a response right now.", 503);
    }
  }
}
async function reliableMusic(request: Request, env: Env): Promise<Response> {
  if (!env.AI) return jsonError("Cloudflare Workers AI binding is not configured.", 503);
  let body: {
    prompt?: string;
    text?: string;
    lyrics?: string;
    instrumental?: boolean;
    lyricsOptimizer?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid music request.", 400);
  }
  const prompt = String(body.prompt || body.text || "").trim();
  if (!prompt) return jsonError("A music description is required.", 400);
  try {
    const result = await env.AI.run("minimax/music-2.6", {
      prompt: prompt.slice(0, 2000),
      lyrics: body.lyrics?.trim() || undefined,
      is_instrumental: Boolean(body.instrumental),
      lyrics_optimizer: body.lyricsOptimizer ?? !body.lyrics?.trim(),
      format: "mp3",
    });
    const audioUrl = mediaUrl(result);
    if (!audioUrl) throw new Error("MiniMax Music 2.6 returned no audio URL.");
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok || !audioResponse.body)
      throw new Error(`Generated music download failed (${audioResponse.status}).`);
    const headers = new Headers(audioResponse.headers);
    headers.set("content-type", headers.get("content-type") || "audio/mpeg");
    headers.set("cache-control", "no-store");
    headers.set("x-music-provider", "MiniMax Music 2.6");
    return new Response(audioResponse.body, { status: 200, headers });
  } catch (error) {
    console.error("Reliable music generation failed", error);
    return jsonError(
      `Music generation failed. ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === "/api/ai/voice-clone" && request.method === "GET") return voiceCloneHealth(env);
    if (path === "/api/ai/voice-clone" && request.method === "POST")
      return handleProductionVoiceClone(request, env);
    if (path === "/api/ai" && request.method === "POST") {
      try {
        const body = (await request.clone().json()) as { capability?: string };
        const capability = String(body.capability || "")
          .toLowerCase()
          .replace(/_/g, "-");
        if (["voice-clone", "voiceclone", "clone"].includes(capability))
          return handleProductionVoiceClone(request, env);
      } catch {}
    }
    if (path === "/api/ai/tts" && request.method === "POST")
      return reliablePresetTTS(request, env);
    if (path === "/api/ai/speech-to-text" && request.method === "POST")
      return reliableSpeechToText(request, env);
    if (path === "/api/ai/chat" && request.method === "POST") {
      try {
        const body = (await request.clone().json()) as { messages?: unknown[] };
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const hasImage = messages.some((message: unknown) => {
          const item = message as ChatMessage;
          const content = item?.content;
          return (
            Array.isArray(content) &&
            content.some((part: unknown) => {
              if (!part || typeof part !== "object") return false;
              return (part as Record<string, unknown>).type === "image_url";
            })
          );
        });
        if (!hasImage) return reliableChat(request, env);
      } catch {}
    }
    if (path === "/api/ai/music" && request.method === "POST") return reliableMusic(request, env);
    return studioServer.fetch(request, env, ctx);
  },
};
