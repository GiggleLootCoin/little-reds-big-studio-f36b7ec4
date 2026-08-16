import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Mic2, Play, Square, Trash2, UserRound, Volume2 } from "lucide-react";
import { runStudioJob } from "@/lib/studio-runtime";
import {
  clearBuddyVoiceClone,
  getBuddyVoiceProfile,
  getBuddyVoiceSample,
  markBuddyCloneVerified,
  saveBuddyVoiceProfile,
  saveBuddyVoiceSample,
} from "@/lib/buddy-voice";
import { BUDDY_MOODS, BUDDY_TONES, BUDDY_VOICE_PRESETS } from "@/lib/buddy-voice";
import { BUDDY_EXPANDED_LANGUAGES, BUDDY_EXPANDED_VOICES } from "@/lib/buddy-voice-expanded";
import { StudioButton } from "./ui";

const CLONE_TEXT = "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";
const REFERENCE_TRANSCRIPT = CLONE_TEXT;
const FAILURE = "Buddy couldn't create the voice clone yet.";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState(
    "Choose a preset, or upload/record a voice sample to create a real clone.",
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const allVoices = useMemo(
    () => [
      ...BUDDY_VOICE_PRESETS.map((v) => ({ ...v, family: "Buddy Originals" })),
      ...BUDDY_EXPANDED_VOICES.map((v) => ({
        ...v,
        family: "Aura Studio — 40 distinct English voices",
      })),
    ],
    [],
  );

  const update = (patch: Partial<typeof profile>) => {
    const next = { ...getBuddyVoiceProfile(), ...patch };
    setProfile(next);
    saveBuddyVoiceProfile(next);
    const voice = allVoices.find((v) => v.id === next.speaker);
    setStatus(
      next.mode === "clone"
        ? next.cloneVerified
          ? "✓ Your verified clone is ready for Buddy."
          : "Your sample is saved. Tap Generate My Voice Clone."
        : `${voice?.label || next.speaker} selected — ${voice?.note || "ready to test"}.`,
    );
  };

  const saveReference = async (file: File) => {
    if (!file.type.startsWith("audio/")) throw new Error("Please choose an audio recording.");
    if (file.size > 3_500_000) throw new Error("Use a clear 3–30 second recording under 3.5 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("The recording could not be read."));
      reader.readAsDataURL(file);
    });
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const duration = await new Promise<number>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("The recording could not be read."));
      audio.src = dataUrl;
    });
    if (!Number.isFinite(duration) || duration < 3 || duration > 30) {
      throw new Error("Use a clear voice recording between 3 and 30 seconds.");
    }
    await saveBuddyVoiceSample(file);
    const next = {
      ...getBuddyVoiceProfile(),
      mode: "clone" as const,
      referenceDataUrl: dataUrl,
      referenceName: file.name,
      referenceTranscript: REFERENCE_TRANSCRIPT,
      cloneVerified: false,
      cloneVerifiedAt: undefined,
      cloneProvider: undefined,
    };
    saveBuddyVoiceProfile(next);
    setProfile(next);
    setStatus("Voice sample saved with its exact transcript. Tap Generate My Voice Clone.");
  };

  const uploadClone = async (file: File) => {
    setBusy(true);
    setStatus("Saving your voice sample…");
    try {
      await saveReference(file);
    } catch (error) {
      setStatus(
        `${FAILURE} ${error instanceof Error ? error.message : "The recording could not be saved."}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus("Voice recording is not supported by this browser. Upload an audio sample instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-sample-${Date.now()}.webm`, { type: blob.type });
        await uploadClone(file);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus(`Read this sentence naturally: “${REFERENCE_TRANSCRIPT}”`);
    } catch {
      setStatus(`${FAILURE} Microphone access was not granted.`);
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const test = async () => {
    setBusy(true);
    setStatus("Generating your real voice clone…");
    try {
      const current = getBuddyVoiceProfile();
      if (current.mode === "clone") {
        const sample = await getBuddyVoiceSample();
        if (!sample) throw new Error("Your voice sample is missing. Upload or record it again.");
        const referenceTranscript = current.referenceTranscript || REFERENCE_TRANSCRIPT;
        const result = await runStudioJob(
          "voice-clone",
          {
            refAudio: sample,
            referenceAudio: sample,
            audio: sample,
            referenceTranscript,
            refText: referenceTranscript,
            target_text: CLONE_TEXT,
            text: CLONE_TEXT,
            language: current.language || "English",
          },
          setStatus,
        );
        if (!result.url) throw new Error("The clone engine returned no playable audio.");
        const player = new Audio(result.url);
        await player.play();
        await markBuddyCloneVerified(result.provider);
        setProfile(getBuddyVoiceProfile());
        setStatus(`✓ REAL VOICE CLONE VERIFIED — ${result.provider}.`);
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
          instruction: `Use a ${current.mood || "natural"} mood and ${current.tone || "conversational"} tone. Sound human and spontaneous.`,
        },
        setStatus,
      );
      if (!result.url) throw new Error("No playable audio returned.");
      const player = new Audio(result.url);
      await player.play();
      setStatus(`✓ ${allVoices.find((v) => v.id === current.speaker)?.label || current.speaker} is working.`);
    } catch (error) {
      setStatus(`${FAILURE} ${error instanceof Error ? error.message : "The clone service did not return usable audio."}`);
    } finally {
      setBusy(false);
    }
  };

  const removeClone = async () => {
    await clearBuddyVoiceClone();
    const next = getBuddyVoiceProfile();
    setProfile(next);
    setStatus("Your clone was removed. Buddy is back on preset voices.");
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Volume2 className="size-4 text-primary" /><div><p className="text-xs font-bold uppercase tracking-[0.14em]">Buddy's voice studio</p><p className="text-[10px] text-muted-foreground">Real preset speakers and a simple upload-or-record voice clone.</p></div></div>
        <StudioButton variant="ghost" onClick={() => void test()} disabled={busy || recording}><Play className="size-3.5" /> Test selected</StudioButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => update({ mode: "preset", cloneVerified: false })} className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><UserRound className="mb-1 size-4 text-primary" /> Preset voices<span className="mt-1 block text-[9px] text-muted-foreground">Real selectable speaker IDs</span></button>
        <button type="button" onClick={() => update({ mode: "clone" })} className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><Mic2 className="mb-1 size-4 text-primary" /> Clone a Voice<span className="mt-1 block text-[9px] text-muted-foreground">Upload or record • no typing required</span></button>
      </div>
      {profile.mode === "preset" ? (
        <select value={profile.speaker} onChange={(e) => update({ speaker: e.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs">
          {["Buddy Originals", "Aura Studio — 40 distinct English voices"].map((family) => <optgroup key={family} label={family}>{allVoices.filter((v) => v.family === family).map((voice) => <option key={voice.id} value={voice.id}>{voice.label} — {voice.note}</option>)}</optgroup>)}
        </select>
      ) : (
        <div className="mt-2 rounded-xl border border-primary/30 bg-background/60 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">{profile.cloneVerified ? <CheckCircle2 className="size-4 text-primary" /> : <Mic2 className="size-4 text-primary" />}{profile.cloneVerified ? "Your Voice Clone — READY" : "Create Your Voice Clone"}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">{profile.cloneVerified ? `Verified with ${profile.cloneProvider || "a real clone engine"}. Buddy can use it now.` : `Read this exact sentence for the strongest clone: “${REFERENCE_TRANSCRIPT}”`}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-xl border border-border bg-background/50 px-3 py-3 text-center text-xs font-semibold"><Volume2 className="mx-auto mb-1 size-5 text-primary" /> Upload Sample<span className="mt-1 block text-[9px] font-normal text-muted-foreground">3–30 seconds</span><input className="sr-only" type="file" accept="audio/*" disabled={busy || recording} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadClone(f); e.currentTarget.value = ""; }} /></label>
            {recording ? <button type="button" onClick={stopRecording} disabled={busy} className="rounded-xl border border-primary bg-primary/10 px-3 py-3 text-center text-xs font-semibold"><Square className="mx-auto mb-1 size-5 text-primary" /> Stop Recording<span className="mt-1 block text-[9px] font-normal text-muted-foreground">Save this sample</span></button> : <button type="button" onClick={() => void startRecording()} disabled={busy} className="rounded-xl border border-border bg-background/50 px-3 py-3 text-center text-xs font-semibold"><Mic2 className="mx-auto mb-1 size-5 text-primary" /> Record Sample<span className="mt-1 block text-[9px] font-normal text-muted-foreground">Read the sentence above</span></button>}
          </div>
          <StudioButton className="mt-3 w-full justify-center" onClick={() => void test()} disabled={busy || recording || !profile.referenceName}><Mic2 className="size-4" /> {busy ? "Generating Your Voice Clone…" : "Generate My Voice Clone"}</StudioButton>
          {profile.cloneVerified && <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-primary">Verified clone saved and ready for Buddy.</span><button type="button" onClick={() => void removeClone()} className="rounded-xl border border-border px-3 py-2 text-xs"><Trash2 className="mr-1 inline size-3.5" /> Remove</button></div>}
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="text-[10px] font-semibold text-muted-foreground">Language<select value={profile.language || "English"} onChange={(e) => update({ language: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground">{BUDDY_EXPANDED_LANGUAGES.map((language) => <option key={language}>{language}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-muted-foreground">Mood<select value={profile.mood || "natural"} onChange={(e) => update({ mood: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground">{BUDDY_MOODS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-muted-foreground">Tone<select value={profile.tone || "conversational"} onChange={(e) => update({ tone: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground">{BUDDY_TONES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      </div>
    </div>
  );
}
