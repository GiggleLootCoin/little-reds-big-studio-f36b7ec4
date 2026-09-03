const base = String(process.env.PRODUCTION_URL || "").replace(/\/$/, "");
if (!base) throw new Error("PRODUCTION_URL is required");

const messages = [
  {
    role: "system",
    content:
      "You are Buddy, Little Red's personal creative studio companion. Reply in one short sentence.",
  },
  { role: "user", content: "Say hello and confirm you are ready." },
];

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: messages.at(-1).content,
      text: messages.at(-1).content,
      messages,
      history: messages,
      language: "English",
      mood: "natural",
      tone: "conversational",
    }),
    signal: controller.signal,
  });
  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }
  if (!response.ok) {
    throw new Error(`Buddy chat returned HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  const reply =
    typeof body === "string"
      ? body.trim()
      : String(body?.response || body?.text || body?.result?.response || body?.result?.text || "").trim();
  if (!reply) {
    throw new Error(`Buddy chat returned HTTP 200 but no response text: ${bodyText.slice(0, 1000)}`);
  }
  console.log(JSON.stringify({ status: "ok", provider: "production /api/ai/chat", reply }));
} finally {
  clearTimeout(timer);
}
