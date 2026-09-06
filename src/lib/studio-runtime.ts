import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified } from "./buddy-voice";
import { getBuiltInRedVoiceSample } from "./red-default-voice";
import { saveVoiceSample } from "./voice-profile";
import { normalizeAndVerifyBrowserAudio } from "./audio-artifact";
import { saveBuddyClonePreview } from "./buddy-voice";
import { createBestFreeVoiceClone } from "./real-voice-clone-v2";
import { buildBuddyMemoryContext, rememberUserMessage } from "./buddy-memory.mjs";

export type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
export { runtimeProviders } from "./studio-runtime-impl";

const DEFAULT_CLONE_TEXT =
  "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";
let cachedRedReferenceId = "";
let cachedRedReferenceBase64 = "";

export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    for (const key of [
      "text",
      "response",
      "generated_text",
      "transcription",
      "transcript",
      "content",
      "value",
      "data",
      "output",
      "result",
    ]) {
      const found = artifactText((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return "";
}
function cloneProfile() {
  return getBuddyVoiceProfile();
}
async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return btoa(binary);
}
async function redReferenceId(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function runProductionRedClone(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
  modelSize: "0.6B" | "1.7B" = "1.7B",
) {
  onStatus?.("Generating Buddy's Red voice…");
  const referenceId = await redReferenceId(sample);
  const alreadyEncoded =
    cachedRedReferenceId === referenceId && cachedRedReferenceBase64.length > 0;
  if (!alreadyEncoded) {
    cachedRedReferenceBase64 = await blobToBase64(sample);
    cachedRedReferenceId = referenceId;
  }
  const makeBody = () => ({
    referenceId,
    audioBase64: cachedRedReferenceBase64,
    audioType: sample.type || "audio/wav",
    text: text.trim().slice(0, 220),
    language,
    refText: refText.trim(),
    modelSize,
  });
  let response = await fetch("/api/ai/voice-clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeBody()),
  });
  if (response.status === 428) {
    onStatus?.("Refreshing Buddy's voice reference…");
    cachedRedReferenceBase64 = await blobToBase64(sample);
    cachedRedReferenceId = referenceId;
    response = await fetch("/api/ai/voice-clone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeBody()),
    });
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Red voice generation failed (${response.status}). ${detail}`.trim());
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("Red voice generation returned empty audio.");
  const normalized = await normalizeAndVerifyBrowserAudio(blob);
  if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
    throw new Error("Red voice generation returned silent or unusable audio.");
  return {
    url: normalized.url,
    provider: response.headers.get("x-clone-provider") || "Production Red reference clone",
    verification: "Production Red reference clone + browser audio decode + non-silent verification",
    duration: normalized.stats.duration,
    peak: normalized.stats.peak,
    rms: normalized.stats.rms,
  };
}
async function runVerifiedClone(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
  modelSize: "0.6B" | "1.7B" = "1.7B",
  persist = true,
  speaker?: string,
) {
  if (speaker === "Red" || cloneProfile().speaker === "Red") {
    const result = await runProductionRedClone(
      sample,
      refText,
      text,
      language,
      onStatus,
      modelSize,
    );
    if (persist) {
      await saveVoiceSample(sample, refText);
      await markBuddyCloneVerified(
        `${result.provider}${result.verification ? ` — ${result.verification}` : ""}`,
      );
      await saveBuddyClonePreview(sample, result.provider);
    }
    return result;
  }
  let result;
  try {
    result = await createBestFreeVoiceClone(
      sample,
      refText,
      text,
      language,
      onStatus,
      modelSize,
      persist,
    );
  } catch (primaryError) {
    onStatus?.("Primary voice generation was unavailable. Trying the free fallback…");
    try {
      const runtime = await import("./studio-runtime-impl");
      const fallback = await runtime.runStudioJob(
        "voice-clone",
        {
          refAudio: sample,
          referenceAudio: sample,
          audio: sample,
          refText,
          referenceTranscript: refText,
          target_text: text,
          text,
          language,
          _skipProviders: ["hf-qwen3-tts"],
        },
        onStatus,
      );
      if (!fallback.url) throw primaryError;
      const fallbackBlob = await fetch(fallback.url).then((response) => {
        if (!response.ok) throw new Error(`Fallback audio download failed (${response.status}).`);
        return response.blob();
      });
      const normalized = await normalizeAndVerifyBrowserAudio(fallbackBlob);
      if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
        throw new Error("Fallback clone returned silent or unusable audio.");
      if (persist) await saveBuddyClonePreview(normalized.blob, fallback.provider);
      result = {
        url: normalized.url,
        provider: fallback.provider,
        verification: `Free fallback ${fallback.provider} + browser audio decode + non-silent artifact verification`,
        duration: normalized.stats.duration,
        peak: normalized.stats.peak,
        rms: normalized.stats.rms,
      };
    } catch (fallbackError) {
      throw new Error(
        `Voice generation failed on the primary and free fallback. ${fallbackError instanceof Error ? fallbackError.message : String(primaryError)}`,
      );
    }
  }
  if (!result.url) throw new Error("The voice engine returned no playable audio.");
  if (persist) {
    await saveVoiceSample(sample, refText);
    await markBuddyCloneVerified(
      `${result.provider}${result.verification ? ` — ${result.verification}` : ""}`,
    );
  }
  return result;
}
async function prepareSpeechToText(input: StudioJobInput): Promise<StudioJobInput> {
  const audio = input.audio;
  if (!(audio instanceof Blob)) return input;
  try {
    return { ...input, audio: (await normalizeAndVerifyBrowserAudio(audio)).blob };
  } catch (error) {
    throw new Error(
      `The microphone recording could not be decoded. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export async function runStudioJob(
  capability: StudioCapability,
  input: StudioJobInput,
  onStatus?: (s: string) => void,
): Promise<StudioArtifact> {
  if (capability === "voice-clone") {
    const sample = input.refAudio ?? input.referenceAudio ?? input.audio;
    // The Voice Lab uses the voice-clone action for both real clones and preset
    // test buttons. Presets do not need reference audio; route them directly to
    // the real preset TTS engine instead of incorrectly demanding a clone sample.
    if (!(sample instanceof Blob)) {
      const speaker = String(input.speaker ?? "").trim();
      if (speaker && speaker !== "Red") {
        const runtime = await import("./studio-runtime-impl");
        const presetInput = {
          ...input,
          text: String(
            input.text ?? input.target_text ?? input.prompt ?? DEFAULT_CLONE_TEXT,
          ).trim(),
          speaker,
        };
        return runtime.runStudioJob("tts", presetInput, onStatus);
      }
      throw new Error("A reference voice recording is required for a real clone.");
    }
    const refText = String(
      input.refText ??
        input.referenceText ??
        input.referenceTranscript ??
        cloneProfile().referenceTranscript ??
        "",
    ).trim();
    const targetText =
      String(input.target_text ?? input.text ?? input.prompt ?? DEFAULT_CLONE_TEXT).trim() ||
      DEFAULT_CLONE_TEXT;
    const language = String(input.language ?? cloneProfile().language ?? "English");
    const modelSize = input.model_size === "0.6B" ? "0.6B" : "1.7B";
    onStatus?.("Using Buddy's Red voice mode…");
    const result = await runVerifiedClone(
      sample,
      refText,
      targetText,
      language,
      onStatus,
      modelSize,
      true,
    );
    return { capability, value: result, url: result.url, provider: result.provider };
  }
  if (capability === "tts") {
    const profile = cloneProfile();
    const text = String(input.text ?? input.target_text ?? input.prompt ?? "").trim();
    if (!text) throw new Error("Voice text is empty.");
    const language = String(input.language ?? profile.language ?? "English");
    const modelSize = input.model_size === "0.6B" ? "0.6B" : "1.7B";
    const wantsRedVoice =
      profile.mode === "clone" || profile.speaker === "Red" || input.speaker === "Red";
    if (wantsRedVoice) {
      let savedSample = await getBuddyVoiceSample();
      const effectiveSpeaker = typeof input.speaker === "string" ? input.speaker : profile.speaker;
      if (!savedSample && effectiveSpeaker === "Red") {
        savedSample = await getBuiltInRedVoiceSample();
        if (savedSample) onStatus?.("Using Buddy's built-in Red voice reference…");
      }
      if (!savedSample) {
        if (profile.mode === "clone" && profile.cloneVerified)
          throw new Error(
            "Buddy's saved voice sample is missing. Please restore the saved voice sample.",
          );
        throw new Error("The built-in Red voice reference is unavailable right now.");
      }
      const refText = profile.referenceTranscript?.trim() || "";
      onStatus?.("Speaking in Buddy's Red voice…");
      const result = await runVerifiedClone(
        savedSample,
        refText,
        text,
        language,
        onStatus,
        modelSize,
        false,
        effectiveSpeaker,
      );
      return { capability: "tts", value: result, url: result.url, provider: result.provider };
    }
  }
  let preparedInput = capability === "speech-to-text" ? await prepareSpeechToText(input) : input;
  if (capability === "chat") {
    const prompt = String(preparedInput.prompt ?? preparedInput.text ?? "").trim();
    if (prompt) rememberUserMessage(prompt);
    const memory = buildBuddyMemoryContext();
    if (memory) {
      const existing = Array.isArray(preparedInput.messages) ? preparedInput.messages : [];
      const systemIndex = existing.findIndex((message) => {
        return (
          message &&
          typeof message === "object" &&
          (message as Record<string, unknown>).role === "system"
        );
      });
      const messages = [...existing];
      if (systemIndex >= 0) {
        const current = messages[systemIndex] as Record<string, unknown>;
        messages[systemIndex] = {
          ...current,
          content: `${String(current.content ?? "").trim()}\n\n${memory}`.trim(),
        };
      } else {
        messages.unshift({ role: "system", content: memory });
      }
      preparedInput = { ...preparedInput, messages, history: messages };
    }
  }
  const mod = await import("./studio-runtime-impl");
  return mod.runStudioJob(capability, preparedInput, onStatus);
}
