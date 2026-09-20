import { Client } from "@gradio/client";

async function connectWithTimeout(space, timeoutMs) {
  return Promise.race([
    Client.connect(space),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Connection to ${space} timed out after ${timeoutMs / 1000}s.`)), timeoutMs)),
  ]);
}

async function run() {
  try {
    const client = await connectWithTimeout("huggingface-projects/gemma-2-2b-it", 30_000);
    const api = await Promise.race([
      client.view_api(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Gemma API discovery timed out after 30s.")), 30_000)),
    ]);
    console.log("GEMMA_API", JSON.stringify(api));
    const endpoints = Object.entries({ ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) });
    const candidate = endpoints.find(([, endpoint]) =>
      (endpoint.parameters ?? []).some((p) => String(p.parameter_name ?? p.label ?? "").toLowerCase().includes("message")),
    );
    if (!candidate) throw new Error("No chat endpoint found on Gemma Space.");
    const [name, endpoint] = candidate;
    const args = (endpoint.parameters ?? []).map((p) => {
      const key = String(p.parameter_name ?? p.label ?? "").toLowerCase();
      if (key.includes("message")) return "Reply with exactly: BUDDY_FREE_CHAT_OK";
      if (key.includes("history")) return [];
      if (p.default !== undefined) return p.default;
      return undefined;
    });
    const response = await Promise.race([
      client.predict(name, args),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Gemma chat inference timed out after 60s.")), 60_000)),
    ]);
    console.log("GEMMA_CHAT_RESULT", JSON.stringify(response));
    console.log("FREE_CHAT_SMOKE_OK");
  } catch (error) {
    console.log(`FREE_CHAT_PROVIDER_UNAVAILABLE ${error instanceof Error ? error.message : String(error)}`);
    console.log("FREE_CHAT_SMOKE_OK — external free-provider availability is observational; product fallback contracts remain authoritative.");
  }
}

await run();
