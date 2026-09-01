export type BuddyEmotion =
  "neutral" | "happy" | "excited" | "curious" | "thinking" | "surprised" | "concerned" | "proud";

export type BuddyActionCapability =
  | "music"
  | "image"
  | "video"
  | "voice-clone"
  | "voice-swap"
  | "singing-voice-conversion"
  | "vocal-separation"
  | "tts";

export type BuddyAgentAction = {
  capability: BuddyActionCapability;
  prompt?: string;
  text?: string;
  reason?: string;
  dependsOn?: number[];
};

export type BuddyAgentPlan = {
  searchWeb: boolean;
  searchQuery?: string;
  emotion: BuddyEmotion;
  reply: string;
  actions: BuddyAgentAction[];
};

const WEB_SIGNAL =
  /\b(latest|current|today|tonight|this week|right now|best|newest|new|find|search|look up|research|who is|what is|where is|how much|price|pricing|available|release|released|update|news)\b/i;
const CREATIVE_SIGNAL =
  /\b(make|create|generate|build|turn|convert|edit|write|produce|design|animate|sing|song|music|beat|image|picture|art|cover|thumbnail|video|movie|voice|character|story|storyboard)\b/i;

export function shouldSearchWeb(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  return (
    WEB_SIGNAL.test(clean) &&
    (CREATIVE_SIGNAL.test(clean) ||
      /\b(find|search|research|latest|current|best|newest|price|pricing)\b/i.test(clean))
  );
}

export function inferEmotion(
  text: string,
  phase: "listening" | "thinking" | "speaking" = "speaking",
): BuddyEmotion {
  if (phase === "listening") return "curious";
  if (phase === "thinking") return "thinking";
  if (/\b(amazing|awesome|love|perfect|hell yeah|great|nailed|success)\b/i.test(text))
    return "excited";
  if (/\b(sorry|failed|error|problem|can't|cannot|unable|sad|bad)\b/i.test(text))
    return "concerned";
  if (/\?|how|why|what|which|where|who\b/i.test(text)) return "curious";
  if (/\b(wow|holy|damn|surprise|surprised)\b/i.test(text)) return "surprised";
  return "neutral";
}

export function buildAgentSystemPrompt(): string {
  return [
    "You are Buddy, Little Red's personal creative studio agent.",
    "You are a live character, not a passive chatbot.",
    "You may research the live web when current information is useful, then use the studio's creative tools.",
    "You can plan multi-step work involving music, images, video, voice cloning, singing voice conversion, vocal separation, and speech.",
    "Red's saved voice is the default voice for Buddy unless the user explicitly chooses another voice.",
    "Never expose provider machinery unless the user asks.",
    "Return a concise natural reply plus a machine-readable action plan when creation work is requested.",
    "Do not claim an asset was created until the corresponding tool actually returns a usable artifact.",
  ].join(" ");
}

export function parseAgentPlan(raw: string, fallbackReply = raw): BuddyAgentPlan {
  try {
    const parsed = JSON.parse(raw) as Partial<BuddyAgentPlan>;
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    return {
      searchWeb: Boolean(parsed.searchWeb),
      searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : undefined,
      emotion: parsed.emotion || inferEmotion(fallbackReply),
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : fallbackReply.trim(),
      actions: actions.filter((a): a is BuddyAgentAction =>
        Boolean(
          a && typeof a === "object" && typeof (a as BuddyAgentAction).capability === "string",
        ),
      ),
    };
  } catch {
    return {
      searchWeb: shouldSearchWeb(raw),
      searchQuery: shouldSearchWeb(raw) ? raw.trim() : undefined,
      emotion: inferEmotion(raw),
      reply: fallbackReply.trim(),
      actions: [],
    };
  }
}

export function defaultRedVoiceIntent(): { preset: "red"; automatic: true } {
  return { preset: "red", automatic: true };
}
