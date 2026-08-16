import { createLocalChatterboxClone } from "./local-chatterbox";
import { runStudioJob } from "./studio-runtime-impl";

export type RealCloneResult = { url: string; provider: string; voiceId?: string };

const DEFAULT_CLONE_TEXT =
  "Hi. I'm Buddy. This is my new voice. Let's make something brilliant together.";

function exaggerationFor(mood: string, tone: string): number {
  const moodValues: Record<string, number> = {
    natural: 0.5,
    warm: 0.62,
    calm: 0.38,
    playful: 0.78,
    energetic: 0.82,
    reassuring: 0.48,
    excited: 0.9,
    cinematic: 0.85,
    serious: 0.32,
  };
  const toneAdjust: Record<string, number> = {
    conversational: 0,
    friendly: 0.05,
    confident: 0.02,
    empathetic: -0.02,
    witty: 0.08,
    direct: -0.04,
    gentle: -0.08,
    professional: -0.06,
  };
  return Math.max(0.25, Math.min(1, (moodValues[mood] ?? 0.5) + (toneAdjust[tone] ?? 0)));
}

async function cloneWithFreeRemoteFallback(
  reference: Blob,
  refText: string,
  text: string,
  language: string,
  mood: string,
  tone: string,
  onStatus?: (status: string) => void,
): Promise<RealCloneResult> {
  onStatus?.(
    "This phone cannot run the local WebGPU engine. Switching automatically to the free/open voice-clone pool…",
  );
  const result = await runStudioJob(
    "voice-clone",
    {
      refAudio: reference,
      referenceAudio: reference,
      audio: reference,
      refText,
      referenceTranscript: refText,
      target_text: text,
      text,
      language,
      mood,
      tone,
    },
    onStatus,
  );
  if (!result.url) throw new Error("The free voice-clone fallback returned no playable audio.");
  return { url: result.url, provider: result.provider };
}

export async function createRealVoiceClone(
  reference: Blob,
  refText = "",
  text = DEFAULT_CLONE_TEXT,
  language = "English",
  mood = "natural",
  tone = "conversational",
  onStatus?: (status: string) => void,
): Promise<RealCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  if (language.toLowerCase() !== "english") {
    throw new Error("The free voice-clone pool currently supports English for this route.");
  }

  try {
    onStatus?.("Trying the free on-device Chatterbox Turbo engine first…");
    const result = await createLocalChatterboxClone(
      reference,
      text.trim() || DEFAULT_CLONE_TEXT,
      exaggerationFor(mood, tone),
      onStatus,
    );
    return { url: result.url, provider: result.provider };
  } catch (localError) {
    const message = localError instanceof Error ? localError.message : String(localError);
    onStatus?.(
      `Local voice cloning is unavailable here (${message}). Trying the free remote fallback…`,
    );
    return cloneWithFreeRemoteFallback(
      reference,
      refText,
      text.trim() || DEFAULT_CLONE_TEXT,
      language,
      mood,
      tone,
      onStatus,
    );
  }
}

export async function speakWithRealVoiceClone(
  reference: Blob,
  refText = "",
  text = DEFAULT_CLONE_TEXT,
  language = "English",
  mood = "natural",
  tone = "conversational",
  onStatus?: (status: string) => void,
): Promise<RealCloneResult> {
  return createRealVoiceClone(reference, refText, text, language, mood, tone, onStatus);
}
