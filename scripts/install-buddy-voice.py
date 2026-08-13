from pathlib import Path

runtime = Path("src/lib/studio-runtime.ts")
text = runtime.read_text()

start = text.index("function pick(")
end = text.index("function fallback(", start)
replacement = '''async function buddyVoiceInput(input: StudioJobInput): Promise<StudioJobInput> {
  if (typeof window === "undefined") return input;
  try {
    const raw = localStorage.getItem("lrbgs-buddy-voice-v1");
    if (!raw) return input;
    const profile = JSON.parse(raw) as { mode?: string; speaker?: string; language?: string; referenceDataUrl?: string };
    const next: StudioJobInput = { ...input };
    if (next.language == null && profile.language) next.language = profile.language;
    if (profile.mode === "clone" && profile.referenceDataUrl && next.referenceAudio == null) {
      next.referenceAudio = await (await fetch(profile.referenceDataUrl)).blob();
    } else if (next.speaker == null && profile.speaker) {
      next.speaker = profile.speaker;
    }
    return next;
  } catch {
    return input;
  }
}

function pick(name: string, input: StudioJobInput) {
  const n = norm(name);
  for (const [k, v] of Object.entries(input)) if (norm(k) === n && v != null) return v;
  const aliases: Record<string, string[]> = {
    prompt: ["prompt", "text", "message", "query", "question", "lyrics"],
    text: ["text", "prompt", "message", "lyrics", "targettext"],
    audio: ["audio", "inputaudio", "sourceaudio", "referenceaudio", "refaudio", "file"],
    image: ["image", "inputimage", "sourceimage", "file"],
    video: ["video", "inputvideo", "file"],
    lyrics: ["lyrics", "lyric", "text", "prompt"],
    history: ["history", "messages", "conversation"],
    speaker: ["speaker", "voice", "voicename", "speakername"],
    language: ["language", "lang"],
    instruct: ["instruct", "instruction", "style", "voiceprompt", "voicedescription"],
    reftext: ["reftext", "referencetext", "transcript"],
  };
  for (const a of aliases[n] ?? []) for (const [k, v] of Object.entries(input)) if (norm(k) === norm(a) && v != null) return v;
  if (n.includes("history") || n.includes("conversation")) return input.history ?? input.messages ?? [];
  if (n.includes("speaker") || n.includes("voice")) return input.speaker ?? input.voice;
  if (n.includes("language") || n === "lang") return input.language ?? "English";
  if (n.includes("reftext") || n.includes("referencetext")) return input.referenceText;
  if (n.includes("instruct") || n.includes("instruction") || n.includes("style")) return input.instruct ?? input.voiceDesign;
  if (n.includes("image")) return input.image;
  if (n.includes("audio") || n.includes("refaudio") || n.includes("referenceaudio")) return input.audio ?? input.refAudio ?? input.referenceAudio;
  if (n.includes("video")) return input.video;
  return undefined;
}

'''
text = text[:start] + replacement + text[end:]

needle = 'export async function runStudioJob(capability: StudioCapability, input: StudioJobInput, onStatus?: (s: string) => void): Promise<StudioArtifact> {'
if needle in text and 'const resolvedInput = capability === "tts"' not in text:
    text = text.replace(needle, needle + ' const resolvedInput = capability === "tts" ? await buddyVoiceInput(input) : input;', 1)
    text = text.replace('runOn(p, input, capability)', 'runOn(p, resolvedInput, capability)', 1)

runtime.write_text(text)

buddy = Path("src/components/studio/BuddyLiveChat.tsx")
b = buddy.read_text()
if 'import { BuddyVoicePicker }' not in b:
    b = b.replace('import "./BuddyVisual.css";', 'import "./BuddyVisual.css";\nimport { BuddyVoicePicker } from "./BuddyVoicePicker";', 1)
marker = '<div className="relative mt-5 grid gap-3 sm:grid-cols-2">'
if '<BuddyVoicePicker />' not in b:
    if marker not in b:
        raise SystemExit("BuddyLiveChat voice insertion marker not found")
    b = b.replace(marker, '<BuddyVoicePicker />\n        ' + marker, 1)
buddy.write_text(b)
