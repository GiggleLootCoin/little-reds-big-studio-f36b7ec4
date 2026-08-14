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
const FRIENDLY_CLONE_FAILURE = "I couldn't clone that voice yet. The sample is safe. Try a clear 3–15 second recording with one speaker.";
const FRIENDLY_VOICE_FAILURE = "Buddy couldn't generate that voice just yet. Try the voice again or choose another character.";

function voiceValue(voice: (typeof BUDDY_VOICE_PRESETS)[number]) {
  return `${voice.id}|||${voice.instruct}`;
}

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose a Buddy voice, or give Buddy a voice sample you own.");
  const selectedVoice = BUDDY_VOICE_PRESETS.find((voice) => voice.id === profile.speaker && voice.instruct === profile.instruct) || BUDDY_VOICE_PRESETS.find((voice) => voice.id === profile.speaker) || BUDDY_VOICE_PRESETS[0];
  const update = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveBuddyVoiceProfile(next);
    const label = BUDDY_VOICE_PRESETS.find((voice) => voice.id === next.speaker && voice.instruct === next.instruct)?.label || next.speaker;
    setStatus(next.mode === "clone" ? "Your saved voice is selected. Buddy will use it for speech." : `${label} is selected for Buddy.`);
  };
  const runClone = async (sample: Blob, current = getBuddyVoiceProfile()) => {
    const result = await runStudioJob("voice-clone", {
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
    }, () => undefined);
    if (!result.url) throw new Error("No playable voice audio was returned.");
    return result.url;
  };
  const uploadClone = async (file: File) => {
    if (!file.type.startsWith("audio/")) return setStatus("Choose an audio file.");
    if (file.size > 3_500_000) return setStatus("Use a short, clear 3–15 second clip under 3.5 MB.");
    setBusy(true);
    setStatus("Checking your voice sample…");
    try {
      const dataUrl = await fileToVoiceDataUrl(file);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      const duration = await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error("The voice sample could not be read."));
        audio.src = dataUrl;
      });
      if (!Number.isFinite(duration) || duration < 3 || duration > 30) throw new Error("Use a clear voice sample between 3 and 30 seconds.");
      await saveBuddyVoiceSample(file);
      let referenceTranscript = "";
      try {
        const stt = await runStudioJob("speech-to-text", { audio: file }, () => undefined);
        referenceTranscript = artifactText(stt.value).trim();
      } catch {
        // Qwen can still clone with x-vector-only mode when no transcript is available.
      }
      update({ mode: "clone", referenceDataUrl: dataUrl, referenceName: file.name, referenceTranscript });
      const savedSample = await getBuddyVoiceSample();
      if (!savedSample) throw new Error("The saved voice sample could not be retrieved.");
      setStatus(referenceTranscript ? "Your sample is ready. Creating a higher-quality clone…" : "Your sample is ready. Creating a speaker-identity clone…");
      await runClone(savedSample);
      setStatus("Voice clone created. Buddy will use your cloned voice now.");
    } catch (error) {
      setStatus(error instanceof Error ? `${FRIENDLY_CLONE_FAILURE} ${error.message}` : FRIENDLY_CLONE_FAILURE);
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
        if (!sample) throw new Error("Your saved Buddy voice sample is unavailable. Please add it again.");
        const url = await runClone(sample, current);
        const audio = new Audio(url);
        await audio.play();
        setStatus("Buddy's cloned voice is working.");
        return;
      }
      const result = await runStudioJob("tts", {
        text: CLONE_TEXT,
        target_text: CLONE_TEXT,
        language: current.language || "English",
        speaker: current.speaker,
        mood: current.mood,
        tone: current.tone,
        instruct: current.instruct || selectedVoice.instruct,
      }, () => undefined);
      if (!result.url) throw new Error("No playable voice audio was returned.");
      const audio = new Audio(result.url);
      await audio.play();
      setStatus("Buddy's selected voice is working.");
    } catch (error) {
      setStatus(error instanceof Error ? `${FRIENDLY_VOICE_FAILURE} ${error.message}` : FRIENDLY_VOICE_FAILURE);
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
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Buddy's voice</p>
            <p className="text-[10px] text-muted-foreground">Choose a character or clone a voice you own.</p>
          </div>
        </div>
        <StudioButton variant="ghost" onClick={() => void preview()} disabled={busy}><Play className="size-3.5" /> Test voice</StudioButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => update({ mode: "preset" })} className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><UserRound className="mb-1 size-4 text-primary" /> Character voices</button>
        <label className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><Mic2 className="mb-1 size-4 text-primary" /> Clone my voice<input className="sr-only" type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadClone(file); event.currentTarget.value = ""; }} /></label>
      </div>
      {profile.mode === "preset" ? (
        <>
          <select value={voiceValue(selectedVoice)} onChange={(event) => { const [speaker, instruct] = event.target.value.split("|||"); update({ speaker, instruct }); }} className="mt-2 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs">
            {BUDDY_VOICE_PRESETS.map((voice) => <option key={voiceValue(voice)} value={voiceValue(voice)}>{voice.label} — {voice.note}</option>)}
          </select>
          <p className="mt-1 text-[9px] text-muted-foreground">The character names are Studio names; the speech engine uses its underlying Qwen timbre plus the selected delivery direction.</p>
        </>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-background/50 px-3 py-2 text-xs"><span className="min-w-0 truncate">{profile.referenceName || "Saved voice sample"}</span><button type="button" onClick={() => { void clearBuddyVoiceClone(); setProfile(getBuddyVoiceProfile()); setStatus("Returned Buddy to the selected character voice."); }} aria-label="Remove saved voice"><Trash2 className="size-3.5" /></button></div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[10px] font-semibold text-muted-foreground">Mood<select value={profile.mood || "natural"} onChange={(event) => update({ mood: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-normal text-foreground">{BUDDY_MOODS.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.note}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-muted-foreground">Tone<select value={profile.tone || "conversational"} onChange={(event) => update({ tone: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-normal text-foreground">{BUDDY_TONES.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.note}</option>)}</select></label>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground" aria-live="polite">{busy ? "Working… " : ""}{status}</p>
      <p className="mt-1 text-[9px] text-muted-foreground">Only clone a voice you own or have permission to use.</p>
    </div>
  );
}
