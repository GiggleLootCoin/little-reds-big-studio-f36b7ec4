import { Client } from "@gradio/client";

const client = await Client.connect("huggingface-projects/gemma-2-2b-it");
const api = await client.view_api();
console.log("GEMMA_API", JSON.stringify(api));

const endpoints = Object.entries({ ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) });
const candidate = endpoints.find(([, endpoint]) => (endpoint.parameters ?? []).some((p) => String(p.parameter_name ?? p.label ?? "").toLowerCase().includes("message")));
if (!candidate) throw new Error("No chat endpoint found on Gemma Space.");
const [name, endpoint] = candidate;
const args = (endpoint.parameters ?? []).map((p) => {
  const key = String(p.parameter_name ?? p.label ?? "").toLowerCase();
  if (key.includes("message")) return "Reply with exactly: BUDDY_FREE_CHAT_OK";
  if (key.includes("history")) return [];
  if (p.default !== undefined) return p.default;
  return undefined;
});
const response = await client.predict(name, args);
console.log("GEMMA_CHAT_RESULT", JSON.stringify(response));
