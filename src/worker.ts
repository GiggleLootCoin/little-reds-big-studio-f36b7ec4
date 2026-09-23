import studioServer from "./server";
import { handleProductionVoiceClone, voiceCloneHealth } from "./lib/production-voice-clone";

type WorkersAIResult = Record<string, unknown> | string | unknown[] | Response | null;
type WorkersAI = {
  run: (model: string, input: unknown, options?: unknown) => Promise<WorkersAIResult>;
};
type Env = {
  AI?: WorkersAI;
  HF_TOKEN?: string;
  CHATTERBOX_ENDPOINT?: string;
  CHATTERBOX_TOKEN?: string;
};

function jsonError(message: string, status = 500) {
  return Response.json(
    { ok: false, error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
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
    // Route shared AI capabilities through the production server router.
    // It owns the complete free-first fallback chain and the current
    // provider contracts, so the Worker must not shadow them with stale
    // duplicate implementations.
    if (
      path === "/api/ai/tts" ||
      path === "/api/ai/speech-to-text" ||
      path === "/api/ai/chat" ||
      path === "/api/ai/web-search"
    )
      return studioServer.fetch(request, env, ctx);
    if (path === "/api/ai/music" && request.method === "POST") return reliableMusic(request, env);
    return studioServer.fetch(request, env, ctx);
  },
};
