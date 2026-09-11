const ROUTES = {
  qwen: {
    id: "qwen3",
    label: "Qwen3 — Buddy default",
    cloudflareModel: "@cf/qwen/qwen3-30b-a3b-fp8",
    localPreferred: true,
    localModel: "Qwen3",
    reason: "Strong general conversation, reasoning and multilingual support.",
  },
  reasoning: {
    id: "gpt-oss-20b",
    label: "GPT-OSS 20B — reasoning",
    cloudflareModel: "@cf/openai/gpt-oss-20b",
    localPreferred: true,
    localModel: "Qwen3",
    reason: "Uses the stronger free hosted reasoning route online; offline falls back to the installed local Qwen model.",
  },
  coding: {
    id: "qwen3",
    label: "Qwen3 — coding",
    cloudflareModel: "@cf/qwen/qwen3-30b-a3b-fp8",
    localPreferred: true,
    localModel: "Qwen3",
    reason: "Keeps coding on the same strong Buddy brain unless a dedicated free coder is added later.",
  },
  vision: {
    id: "qwen3-vision",
    label: "Qwen3 — vision",
    cloudflareModel: "@cf/qwen/qwen3.8-27b",
    localPreferred: false,
    localModel: "Qwen3",
    reason: "Current Cloudflare Qwen vision route for image-aware requests.",
  },
  fast: {
    id: "llama-3.2-1b",
    label: "Llama 3.2 1B — fast fallback",
    cloudflareModel: "@cf/meta/llama-3.2-1b-instruct",
    localPreferred: true,
    localModel: "Qwen3",
    reason: "Small hosted open model for quick/simple requests; offline uses the installed local model.",
  },
};

function textOf(input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const messageText = messages.map((message) => {
    if (!message || typeof message !== "object") return "";
    const content = message.content;
    return typeof content === "string" ? content : "";
  }).join(" ");
  return `${String(input.prompt ?? input.text ?? "")} ${messageText}`.trim().toLowerCase();
}

export function hasVisionInput(input) {
  if (input.image != null) return true;
  const messages = Array.isArray(input.messages) ? input.messages : [];
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const content = message.content;
    return Array.isArray(content) && content.some((part) => {
      return part && typeof part === "object" && part.type === "image_url";
    });
  });
}

export function selectBuddyModel(input) {
  const requested = String(input.model ?? input.modelRoute ?? "").trim().toLowerCase();
  if (requested === "vision" || requested === "qwen3-vision") return ROUTES.vision;
  if (requested === "reasoning" || requested === "gpt-oss-20b") return ROUTES.reasoning;
  if (requested === "fast" || requested === "llama-3.2-1b") return ROUTES.fast;
  if (hasVisionInput(input)) return ROUTES.vision;

  const text = textOf(input);
  if (/\b(debug|debugging|code|coding|typescript|javascript|python|sql|regex|function|api)\b/.test(text))
    return ROUTES.coding;
  if (/\b(prove|derive|deep reasoning|reason this|step by step|architecture|tradeoff|analy[sz]e deeply)\b/.test(text))
    return ROUTES.reasoning;
  if (text.length < 80 && /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no)\b/.test(text))
    return ROUTES.fast;
  return ROUTES.qwen;
}

export function buddyModelCatalog() {
  return Object.values(ROUTES);
}
