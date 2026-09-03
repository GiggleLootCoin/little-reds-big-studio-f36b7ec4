const KEY = "lrbgs-buddy-memory-v1";
const MAX_MEMORIES = 24;
const MAX_LENGTH = 240;

function storage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function clean(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
}

export function extractBuddyMemories(text) {
  const cleanText = clean(String(text || ""));
  if (!cleanText) return [];
  const found = [];
  const add = (value) => {
    const item = clean(value).replace(/[.!?]+$/, "");
    if (item && !found.includes(item)) found.push(item);
  };

  let match = cleanText.match(/^remember(?: that)?\s+(.+)$/i);
  if (match) add(match[1]);
  match = cleanText.match(/^(?:my name is|call me)\s+(.+)$/i);
  if (match) add(`Name: ${match[1]}`);
  match = cleanText.match(/^my favorite\s+([^.!?]+?)\s+is\s+(.+)$/i);
  if (match) add(`Favorite ${match[1].trim()}: ${match[2]}`);
  match = cleanText.match(/^(i (?:like|love|prefer|hate|don't like|do not like)\s+.+)$/i);
  if (match) add(match[1]);
  match = cleanText.match(/^(i (?:live in|am from|work on|am working on)\s+.+)$/i);
  if (match) add(match[1]);
  return found;
}

export function loadBuddyMemories() {
  const s = storage();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s.getItem(KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string").map(clean).filter(Boolean).slice(-MAX_MEMORIES)
      : [];
  } catch {
    return [];
  }
}

export function rememberUserMessage(text) {
  const memories = loadBuddyMemories();
  const additions = extractBuddyMemories(text);
  if (!additions.length) return memories;
  const next = [...memories];
  for (const memory of additions) {
    const existing = next.findIndex((x) => x.toLowerCase() === memory.toLowerCase());
    if (existing >= 0) next.splice(existing, 1);
    next.push(memory);
  }
  const result = next.slice(-MAX_MEMORIES);
  const s = storage();
  if (s) {
    try {
      s.setItem(KEY, JSON.stringify(result));
    } catch {}
  }
  return result;
}

export function buildBuddyMemoryContext() {
  const memories = loadBuddyMemories();
  if (!memories.length) return "";
  return [
    "Persistent Buddy memory: these are facts or preferences the user explicitly asked Buddy to remember or stated as a personal preference.",
    ...memories.map((memory) => `- ${memory}`),
    "Use this memory naturally when relevant. Do not invent additional memories.",
  ].join("\n");
}

export function clearBuddyMemories() {
  const s = storage();
  if (s) {
    try {
      s.removeItem(KEY);
    } catch {}
  }
}
