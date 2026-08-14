import { useState } from "react";
import { CheckCircle2, Mic2, Play, RotateCcw, Trash2, UserRound, Volume2 } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import {
  BUDDY_MOODS,
  BUDDY_TONES,
  BUDDY_VOICE_PRESETS,
  clearBuddyVoiceClone,
  fileToVoiceDataUrl,
  getBuddyVoiceProfile,
  getBuddyVoiceSample,
  markBuddyCloneVerified,
  saveBuddyVoiceProfile,
  saveBuddyVoiceSample,
} from "@/lib/buddy-voice";
import { StudioButton } from "./ui";

const CLONE_TEXT =
  "Hi. I'm Buddy from Little Red's Big Studio. This is my voice speaking with Red's own voice reference.";
const FRIENDLY_CLONE_FAILURE =
  "I saved your reference safely, but the clone engine did not return a verified sample yet. Try Clone My Voice again when the engine is available.";
const FRIENDLY_VOICE_FAILURE =
  "Buddy couldn't get that voice ready just yet. Try another voice or tap Test again.";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Choose a voice, then test it. Buddy will only mark a clone ready after real audio returns.",
  );
  const update = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveBuddyVoiceProfile(next);
    const label = BUDDY_VOICE_PRESETS.find((v) => v.id === next.speaker)?.label || next.speaker;
    setStatus(
      next.mode === "clone"
        ? next.cloneVerified
          ? "Red's verified clone is selected for Buddy."
          : "Red's reference is saved; the clone still needs a verified sample."
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
        model_size: "0.6B",
        mood: current.mood,
        tone: current.tone,
      },
      setStatus,
    );
    if (!result.url) throw new Error("No playable cloned audio was returned.");
    return result;
  };
  const uploadClone = async (file: File) => {
    if (!file.type.startsWith("audio/")) return setStatus("Choose an audio file.");
    if (file.size > 3_500_000)
      return setStatus("Use a short, clear 2–30 second clip under 3.5 MB.");
    setBusy(true);
    setStatus("Saving Red's reference and checking it…");
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
        const stt = await runStudioJob("speech-to-text", { audio: file }, setStatus);
        referenceTranscript = artifactText(stt.value).trim();
      } catch {
        /* optional */
      }
      const next = {
        ...getBuddyVoiceProfile(),
        mode: "clone" as const,
        referenceDataUrl: dataUrl,
        referenceName: file.name,
        referenceTranscript,
        cloneVerified: false,
        cloneVerifiedAt: undefined,
        cloneProvider: undefined,
      };
      setProfile(next);
      saveBuddyVoiceProfile(next);
      const savedSample = await getBuddyVoiceSample();
      if (!savedSample) throw new Error("The saved voice sample could not be retrieved.");
      const result = await runClone(savedSample, next);
      await markBuddyCloneVerified(result.provider);
      setProfile(getBuddyVoiceProfile());
      const preview = new Audio(result.url!);
      await preview.play();
      setStatus(
        `✓ REAL CLONE VERIFIED — ${result.provider}. Red's clone is now available to Buddy.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${FRIENDLY_CLONE_FAILURE} ${error.message}`
          : FRIENDLY_CLONE_FAILURE,
      );
    } finally {
      setBusy(false);
    }
  };
  const preview = async () => {
    setBusy(true);
    setStatus("Testing the selected Buddy voice…");
    try {
      const current = getBuddyVoiceProfile();
      if (current.mode === "clone") {
        const sample = await getBuddyVoiceSample();
        if (!sample) throw new Error("Red's saved voice reference is unavailable.");
        const result = await runClone(sample, current);
        const audio = new Audio(result.url!);
        await audio.play();
        if (!current.cloneVerified) {
          await markBuddyCloneVerified(result.provider);
          setProfile(getBuddyVoiceProfile());
        }
        setStatus(`✓ REAL CLONE VERIFIED — ${result.provider}. Buddy can use Red's voice now.`);
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
          instruction: `Deliver this in a ${current.mood || "natural"} mood and ${current.tone || "conversational"} tone.`,
        },
        setStatus,
      );
      if (!result.url) throw new Error("No playable voice audio was returned.");
      const audio = new Audio(result.url);
      await audio.play();
      setStatus("✓ Voice tested successfully — this is the selected preset speaker.");
    } catch {
      setStatus(FRIENDLY_VOICE_FAILURE);
    } finally {
      setBusy(false);
    }
  };
  const removeClone = async () => {
    await clearBuddyVoiceClone();
    const next = getBuddyVoiceProfile();
    setProfile(next);
    setStatus("Red's clone was removed. Buddy is back on the selected preset.");
  };
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 text-primary" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Buddy's voice</p>
            <p className="text-[10px] text-muted-foreground">
              Real speakers, real tests, and a separate verified clone.
            </p>
          </div>
        </div>
        <StudioButton variant="ghost" onClick={() => void preview()} disabled={busy}>
          <Play className="size-3.5" /> Test selected
        </StudioButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => update({ mode: "preset", cloneVerified: false })}
          className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}
        >
          <UserRound className="mb-1 size-4 text-primary" /> Preset voices
          <span className="mt-1 block text-[9px] text-muted-foreground">
            Distinct real speaker IDs
          </span>
        </button>
        <label
          className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}
        >
          <Mic2 className="mb-1 size-4 text-primary" /> Clone Red's voice
          <span className="mt-1 block text-[9px] text-muted-foreground">
            Upload 2–30 sec reference
          </span>
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
        <div className="mt-2 rounded-xl border border-primary/30 bg-background/60 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {profile.cloneVerified ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <Mic2 className="size-4 text-primary" />
            )}{" "}
            Red's Voice Clone {profile.cloneVerified ? "— READY" : "— REFERENCE SAVED"}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {profile.cloneVerified
              ? `Verified with ${profile.cloneProvider || "a real clone engine"}. Buddy can use this voice now.`
              : "The reference is stored, but Buddy will not call it a clone until a real generated sample is verified."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StudioButton variant="ghost" onClick={() => void preview()} disabled={busy}>
              <Play className="size-3.5" />{" "}
              {profile.cloneVerified ? "Play my clone" : "Generate + verify"}
            </StudioButton>
            <button
              type="button"
              onClick={() => void removeClone()}
              className="rounded-xl border border-border px-3 py-2 text-xs"
            >
              <Trash2 className="mr-1 inline size-3.5" /> Remove
            </button>
            <label className="rounded-xl border border-border px-3 py-2 text-xs cursor-pointer">
              <RotateCcw className="mr-1 inline size-3.5" /> Re-record
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
        Only use a voice you own or have permission to use.
      </p>
    </div>
  );
}
