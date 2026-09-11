const base = String(process.env.BUDDY_LOCAL_QWEN_URL || "http://127.0.0.1:8080")
  .trim()
  .replace(/\/+$/, "");
const chatUrl = /\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
const healthUrl = `${base.replace(/\/v1$/i, "")}/health`;
const model = String(process.env.BUDDY_LOCAL_QWEN_MODEL || "Qwen3").trim();

async function request(url, init, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let health = "unavailable";
try {
  const response = await request(healthUrl, undefined, 1500);
  health = response.ok ? "ok" : `HTTP ${response.status}`;
} catch {}

console.log(`Local Qwen base: ${base}`);
console.log(`Health: ${health}`);

const response = await request(
  chatUrl,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: local Qwen OK" }],
      max_tokens: 16,
      temperature: 0,
      stream: false,
    }),
  },
  20000,
);

const text = await response.text();
if (!response.ok) {
  console.error(`Chat endpoint failed: HTTP ${response.status}`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

let json;
try {
  json = JSON.parse(text);
} catch {
  console.error("Chat endpoint returned non-JSON output.");
  process.exit(1);
}

const reply = json?.choices?.[0]?.message?.content;
if (typeof reply !== "string" || !reply.trim()) {
  console.error("Chat endpoint returned no assistant content.");
  process.exit(1);
}

console.log(`Assistant: ${reply.trim()}`);
console.log("Local Qwen endpoint is responding with a usable OpenAI-compatible chat artifact.");
