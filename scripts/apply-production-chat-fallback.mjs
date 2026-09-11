import { readFile, writeFile } from "node:fs/promises";

const path = "src/server.ts";
let source = await readFile(path, "utf8");
const oldProvider = `async function openRouterChat(env: ServerEnv, messages: unknown[]): Promise<unknown> {
  if (env.AI) {
    const model = hasImageContent(messages)
      ? "@cf/qwen/qwen3.8-27b"
      : "@cf/qwen/qwen3-30b-a3b-fp8";
    const result = await env.AI.run(model, {
      messages,
      max_tokens: 320,
      temperature: 0.55,
      stream: false,
    });
    return result;
  }
  const key = env.OPENROUTERAI_API_KEY?.trim();`;
const newProvider = `async function openRouterChat(env: ServerEnv, messages: unknown[]): Promise<unknown> {
  let cloudflareError: unknown;
  if (env.AI) {
    try {
      const model = hasImageContent(messages)
        ? "@cf/qwen/qwen3.8-27b"
        : "@cf/qwen/qwen3-30b-a3b-fp8";
      return await env.AI.run(model, {
        messages,
        max_tokens: 256,
        temperature: 0.55,
        stream: false,
      });
    } catch (error) {
      cloudflareError = error;
      console.warn("Cloudflare Buddy chat failed; trying configured free fallback", error);
    }
  }
  const key = env.OPENROUTERAI_API_KEY?.trim();`;
if (!source.includes("let cloudflareError: unknown;")) {
  if (!source.includes(oldProvider)) throw new Error("Expected Buddy chat provider block was not found.");
  source = source.replace(oldProvider, newProvider);
  const oldGuard = `  if (!key) throw new Error("Buddy chat engine is not configured");`;
  const newGuard = `  if (!key) {
    if (cloudflareError instanceof Error) throw cloudflareError;
    throw new Error("Buddy chat engine is not configured");
  }`;
  if (!source.includes(oldGuard)) throw new Error("Expected Buddy chat key guard was not found.");
  source = source.replace(oldGuard, newGuard);
  await writeFile(path, source);
  console.log("Applied Buddy free chat failover: Cloudflare AI errors now fall through to configured OpenRouter.");
} else {
  console.log("Buddy free chat failover already present.");
}
