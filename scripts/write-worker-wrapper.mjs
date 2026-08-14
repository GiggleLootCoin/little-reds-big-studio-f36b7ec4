import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist/server", { recursive: true });
await writeFile(
  "dist/server/worker-wrapper.js",
  `import studioServer from "./server.js";\nimport { handleProductionVoiceClone, voiceCloneHealth } from "../../src/lib/production-voice-clone.ts";\n\nexport default {\n  async fetch(request, env, ctx) {\n    const url = new URL(request.url);\n    const path = url.pathname.replace(/\\/$/, "") || "/";\n    if (path === "/api/ai/voice-clone" && request.method === "GET") return voiceCloneHealth();\n    if (path === "/api/ai/voice-clone" && request.method === "POST") return handleProductionVoiceClone(request, env);\n    if (path === "/api/ai" && request.method === "POST") {\n      try {\n        const body = await request.clone().json();\n        const capability = String(body?.capability || "").toLowerCase().replace(/_/g, "-");\n        if (["voice-clone", "voiceclone", "clone"].includes(capability)) return handleProductionVoiceClone(request, env);\n      } catch {\n        // Let the normal server handle malformed generic requests.\n      }\n    }\n    return studioServer.fetch(request, env, ctx);\n  },\n};\n`,
  "utf8",
);
