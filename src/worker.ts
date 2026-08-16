import studioServer from "./server";
import { handleProductionVoiceClone, voiceCloneHealth } from "./lib/production-voice-clone";

type Env = { HF_TOKEN?: string; CHATTERBOX_ENDPOINT?: string; CHATTERBOX_TOKEN?: string };

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
      } catch {
        // Let the normal application API handle malformed generic requests.
      }
    }

    return studioServer.fetch(request, env, ctx);
  },
};
