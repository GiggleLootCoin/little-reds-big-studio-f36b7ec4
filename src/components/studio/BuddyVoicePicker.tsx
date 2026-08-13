import { useState } from "react";
import { Mic2, Play, Trash2, UserRound, Volume2 } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import {
  BUDDY_MOODS,
  BUDDY_TONES,
  BUDDY_VOICE_PRESETS,
  clearBuddyVoiceClone,
  fileToVoiceDataUrl,
  getBuddyVoiceProfile,
  getBuddyVoiceSample,
  saveBuddyVoiceProfile,
  saveBuddyVoiceSample,
} from "@/lib/buddy-voice";
import { StudioButton } from "./ui";

const CLONE_TEXT = "Hi. I'm Buddy, and this is my voice from Little Red's Big Studio.";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose Buddy's voice first. You can change it anytime.");
  const update = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveBuddyVoiceProfile(next);
    const label = BUDDY_VOICE_PRESETS.find((v) => v.id === next.speaker)?.label || next.speaker;
    setStatus(
      next.mode === "clone"
        ? "Your saved voice is selected for Buddy."
        : `${label} is selected for Buddy.`,
    );
  };
  const runClone = async (sample: Blob, current = getBuddyVoiceProfile()) => {
    const result = await runStudioJob(
      "voice-clone",
      {
        refAudio: sample,
        referenceAudio: sample,
        audio: sample,
        referenceTranscript: current.referenceTranscript || "",
        refText: current.referenceTranscript || "",
        target_text: CLONE_TEXT,
        text: CLONE_TEXT,
        language: current.language || "Auto",
        use_xvector_only: !current.referenceTranscript,
        model_size: "1.7B",
        mood: current.mood,
        tone: current.tone,
      },
      () => undefined,
    );
    if (!result.url) throw new Error("The clone engine returned no playable audio.");
    return result.url;
  };
  const uploadClone = async (file: File) => {
    if (!file.type.startsWith("audio/")) return setStatus("Choose an audio file.");
    if (file.size > 3_500_000)
      return setStatus("Use a short, clear 2–30 second clip under 3.5 MB.");
    setBusy(true);
    try {
      const dataUrl = await fileToVoiceDataUrl(file),
        audio = document.createElement("audio");
      audio.preload = "metadata";
      const duration = await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error("The voice sample could not be read."));
        audio.src = dataUrl;
      });
      if (!Number.isFinite(duration) || duration < 2 || duration > 30)
        throw new Error("Use a clear voice sample between 2 and 30 seconds.");
      await saveBuddyVoiceSample(file);
      let referenceTranscript = "";
      try {
        const stt = await runStudioJob("speech-to-text", { audio: file }, () => undefined);
        referenceTranscript = artifactText(stt.value).trim();
      } catch {
        /* x-vector-only fallback */
      }
      update({
        mode: "clone",
        referenceDataUrl: dataUrl,
        referenceName: file.name,
        referenceTranscript,
      });
      const savedSample = await getBuddyVoiceSample();
      if (!savedSample) throw new Error("The saved voice sample could not be retrieved.");
      try {
        await runClone(savedSample);
        setStatus("Your voice was cloned successfully. Buddy will use it now.");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The public voice service is temporarily unavailable.";
        const transient =
          /quota|zerogpu|capacity|temporarily|no endpoint|metadata|rate limit|429/i.test(message);
        setStatus(
          transient
            ? "Your voice sample is safely saved on this device. The free renderer is temporarily unavailable; Buddy will keep the sample ready."
            : `Your voice sample is saved, but cloning is unavailable right now. ${message}`,
        );
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `I couldn't save that voice sample. ${error.message}`
          : "I couldn't save that voice sample.",
      );
    } finally {
      setBusy(false);
    }
  };
  const preview = async () => {
    setBusy(true);
    setStatus("Testing Buddy's selected voice…");
    try {
      const current = getBuddyVoiceProfile();
      if (current.mode === "clone") {
        const sample = await getBuddyVoiceSample();
        if (!sample)
          throw new Error("Your saved Buddy voice sample is unavailable. Please add it again.");
        const url = await runClone(sample, current);
        const audio = new Audio(url);
        await audio.play();
        setStatus("Buddy's cloned voice is working.");
        return;
      }
      const result = await runStudioJob(
        "tts",
        {
          text: CLONE_TEXT,
          target_text: CLONE_TEXT,
          language: current.language || "English",
          speaker: current.speaker,
          mood: current.mood,
          tone: current.tone,
          instruct:
            current.mood === "natural" && current.tone === "conversational"
              ? ""
              : `Speak naturally with a ${current.mood || "natural"} mood and ${current.tone || "conversational"} tone.`,
        },
        () => undefined,
      );
      if (!result.url) throw new Error("The voice renderer returned no playable audio.");
      const audio = new Audio(result.url);
      await audio.play();
      setStatus("Buddy's selected voice is working.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Voice preview could not be played.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 text-primary" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em]">1. Choose Buddy's voice</p>
            <p className="text-[10px] text-muted-foreground">
              Pick a voice now. Change it whenever you want.
            </p>
          </div>
        </div>
        <StudioButton variant="ghost" onClick={() => void preview()} disabled={busy}>
          <Play className="size-3.5" /> Test voice
        </StudioButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => update({ mode: "preset" })}
          className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}
        >
          <UserRound className="mb-1 size-4 text-primary" /> Preset voice
        </button>
        <label
          className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}
        >
          <Mic2 className="mb-1 size-4 text-primary" /> Use my voice
          <input
            className="sr-only"
            type="file"
            accept="audio/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadClone(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {profile.mode === "preset" ? (
        <select
          value={profile.speaker}
          onChange={(event) => update({ speaker: event.target.value })}
          className="mt-2 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs"
        >
          {BUDDY_VOICE_PRESETS.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label} — {voice.note}
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-background/50 px-3 py-2 text-xs">
          <span className="min-w-0 truncate">{profile.referenceName || "Saved voice sample"}</span>
          <button
            type="button"
            onClick={() => {
              void clearBuddyVoiceClone();
              setProfile(getBuddyVoiceProfile());
              setStatus("Returned Buddy to the selected preset voice.");
            }}
            aria-label="Remove saved voice"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[10px] font-semibold text-muted-foreground">
          Mood
          <select
            value={profile.mood || "natural"}
            onChange={(event) => update({ mood: event.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-normal text-foreground"
          >
            {BUDDY_MOODS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {item.note}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-semibold text-muted-foreground">
          Tone
          <select
            value={profile.tone || "conversational"}
            onChange={(event) => update({ tone: event.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-normal text-foreground"
          >
            {BUDDY_TONES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {item.note}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground" aria-live="polite">
        {busy ? "Working… " : ""}
        {status}
      </p>
      <p className="mt-1 text-[9px] text-muted-foreground">
        Only upload a voice you own or have permission to use.
      </p>
    </div>
  );
}
