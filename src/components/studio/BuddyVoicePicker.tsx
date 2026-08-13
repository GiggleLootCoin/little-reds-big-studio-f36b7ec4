import { useState } from "react";
import { Mic2, Play, Trash2, UserRound, Volume2 } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import {
  BUDDY_VOICE_PRESETS,
  clearBuddyVoiceClone,
  fileToVoiceDataUrl,
  getBuddyVoiceProfile,
  getBuddyVoiceSample,
  saveBuddyVoiceProfile,
  saveBuddyVoiceSample,
} from "@/lib/buddy-voice";
import { StudioButton } from "./ui";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose Buddy's voice first. You can change it anytime.");

  const update = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveBuddyVoiceProfile(next);
    setStatus(
      next.mode === "clone"
        ? "Your saved voice is selected for Buddy."
        : `${next.speaker} is selected for Buddy.`,
    );
  };

  const uploadClone = async (file: File) => {
    if (!file.type.startsWith("audio/")) return setStatus("Choose an audio file.");
    if (file.size > 3_500_000)
      return setStatus("Use a short, clear 2–30 second clip under 3.5 MB.");
    setBusy(true);
    try {
      const dataUrl = await fileToVoiceDataUrl(file);
      const audio = document.createElement("audio");
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
        // Qwen's x-vector-only mode remains available when transcription is unavailable.
      }

      update({
        mode: "clone",
        referenceDataUrl: dataUrl,
        referenceName: file.name,
        referenceTranscript,
      });

      // Explicitly fetch the persistent IndexedDB Blob and pass it through the
      // voice-clone capability. Do not rely on a UI data URL or a generic TTS
      // request to infer that this should be a clone.
      const savedSample = await getBuddyVoiceSample();
      if (!savedSample) throw new Error("The saved voice sample could not be retrieved.");

      const testText = "Hi. I'm Buddy, and this is my voice from Little Red's Big Studio.";
      const result = await runStudioJob(
        "voice-clone",
        {
          refAudio: savedSample,
          referenceAudio: savedSample,
          audio: savedSample,
          referenceTranscript,
          refText: referenceTranscript,
          target_text: testText,
          text: testText,
          language: "English",
          use_xvector_only: !referenceTranscript,
          model_size: "0.6B",
        },
        () => undefined,
      );
      if (!result.url) throw new Error("The clone engine returned no playable audio.");

      setStatus(
        referenceTranscript
          ? "Your voice was cloned successfully. Press Test voice to hear it, and Buddy will use it now."
          : "Your voice was cloned successfully using the emergency speaker-vector path. Press Test voice to hear it; a transcript can improve quality.",
      );
    } catch (error) {
      await clearBuddyVoiceClone();
      setProfile(getBuddyVoiceProfile());
      setStatus(
        error instanceof Error
          ? `I couldn't create the voice from that sample yet. ${error.message}`
          : "I couldn't create the voice from that sample yet. Try a clearer 5–15 second recording.",
      );
    } finally {
      setBusy(false);
    }
  };

  const browserPreview = (text: string) => {
    if (!("speechSynthesis" in window))
      throw new Error("This browser does not provide speech playback.");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = profile.language || navigator.language || "en-US";
    u.rate = 0.98;
    const voices = speechSynthesis.getVoices();
    const wanted = profile.speaker.toLowerCase();
    const match = voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith(u.lang.toLowerCase()) &&
        v.name.toLowerCase().includes(wanted),
    );
    if (match) u.voice = match;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const preview = async () => {
    setBusy(true);
    setStatus("Testing Buddy's selected voice…");
    try {
      const current = getBuddyVoiceProfile();
      const text = "Hi. I'm Buddy, and this is my voice from Little Red's Big Studio.";
      if (current.mode === "clone") {
        const savedSample = await getBuddyVoiceSample();
        if (!savedSample) throw new Error("Your saved voice sample is unavailable. Please add it again.");
        const result = await runStudioJob(
          "voice-clone",
          {
            refAudio: savedSample,
            referenceAudio: savedSample,
            audio: savedSample,
            referenceTranscript: current.referenceTranscript || "",
            refText: current.referenceTranscript || "",
            target_text: text,
            text,
            language: current.language || "English",
            use_xvector_only: !current.referenceTranscript,
            model_size: "0.6B",
          },
          () => undefined,
        );
        if (!result.url) throw new Error("The saved clone returned no playable audio.");
        const audio = new Audio(result.url);
        await audio.play();
        setStatus("Buddy's cloned voice is working.");
        return;
      }

      const input: Record<string, unknown> = {
        text,
        target_text: text,
        language: current.language || "English",
        speaker: current.speaker,
        model_size: "0.6B",
      };
      try {
        const result = await runStudioJob("tts", input, () => undefined);
        if (result.url) {
          const audio = new Audio(result.url);
          await audio.play();
          setStatus(`${current.speaker} is working through Qwen3-TTS.`);
          return;
        }
      } catch {
        /* use browser fallback only for preset preview */
      }
      browserPreview(text);
      setStatus("Qwen3-TTS is temporarily unavailable; device voice fallback is playing.");
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
