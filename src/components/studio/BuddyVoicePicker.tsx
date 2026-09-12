import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Mic2, Play, Square, Trash2, UserRound, Volume2 } from "lucide-react";
import { runLittleRedJob } from "@/lib/little-red-engine";
import {
  clearBuddyVoiceClone,
  getBuddyVoiceProfile,
  getBuddyVoiceSample,
  markBuddyCloneVerified,
  saveBuddyVoiceProfile,
  BUDDY_VOICE_PRESETS,
} from "@/lib/buddy-voice";
import { saveLocalBuddyVoiceReference } from "@/lib/local-voice-reference";
import { getStoredPresetPreview } from "@/lib/stored-preset-previews";
import { normalizeBuddyPresetSpeaker } from "@/lib/buddy-preset-voice-routing";
import { StudioButton } from "./ui";

const CLONE_TEXT = "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";
const REFERENCE_TRANSCRIPT = CLONE_TEXT;
const normalizePresetSpeaker = (speaker: string) => normalizeBuddyPresetSpeaker(speaker);
const FAILURE = "Buddy couldn't create the voice clone yet.";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [presetCandidate, setPresetCandidate] = useState(normalizePresetSpeaker(profile.speaker));
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const [status, setStatus] = useState("Choose a preset, or upload/record a voice sample to create a real clone.");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);

  const allVoices = useMemo(() => BUDDY_VOICE_PRESETS.map((voice) => ({ ...voice, family: "Stored Preset Voices" })), []);

  const displaySpeaker = (speaker: string) => {
    const raw = normalizePresetSpeaker(speaker);
    return allVoices.find((voice) => voice.id === raw)?.label || speaker;
  };

  const setGeneratedAudio = (url: string) => {
    if (audioUrlRef.current && audioUrlRef.current !== url) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = url;
    setAudioUrl(url || null);
  };

  const update = (patch: Partial<typeof profile>) => {
    const next = { ...getBuddyVoiceProfile(), ...patch };
    const speaker = next.mode === "preset" ? normalizePresetSpeaker(next.speaker) : next.speaker;
    const canonicalNext = { ...next, speaker };
    setProfile(canonicalNext);
    setPresetCandidate(speaker);
    setPreviewVoice(null);
    saveBuddyVoiceProfile(canonicalNext);
    const voice = allVoices.find((item) => item.id === speaker);
    setStatus(
      canonicalNext.mode === "clone" || canonicalNext.speaker === "Red"
        ? canonicalNext.cloneVerified
          ? "✓ Your verified clone is ready for Buddy."
          : "Your sample is saved. Tap Generate My Voice Clone."
        : `${voice?.label || displaySpeaker(speaker)} selected — ready to use with Buddy.`,
    );
  };

  const saveReference = async (file: File) => {
    if (!file.type.startsWith("audio/")) throw new Error("Please choose an audio recording.");
    if (file.size > 5_000_000) throw new Error("Use a clear 30–60 second recording under 5 MB.");
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
    if (!Number.isFinite(duration) || duration < 25 || duration > 65) throw new Error("Use a clear voice recording between about 30 and 60 seconds.");
    await saveLocalBuddyVoiceReference(file);
    const next = { ...getBuddyVoiceProfile(), mode: "clone" as const, referenceDataUrl: dataUrl, referenceName: file.name, referenceTranscript: REFERENCE_TRANSCRIPT, cloneVerified: false, cloneVerifiedAt: undefined, cloneProvider: undefined };
    saveBuddyVoiceProfile(next);
    setProfile(next);
    setStatus("Voice sample saved with its exact transcript. Tap Generate My Voice Clone.");
  };

  const uploadClone = async (file: File) => {
    setBusy(true);
    setStatus("Saving your voice sample locally…");
    try {
      await saveReference(file);
    } catch (error) {
      setStatus(`${FAILURE} ${error instanceof Error ? error.message : "The recording could not be saved."}`);
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
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await uploadClone(new File([blob], `voice-sample-${Date.now()}.webm`, { type: blob.type }));
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

  const previewPreset = async () => {
    const speaker = normalizePresetSpeaker(String(presetCandidate || ""));
    if (!speaker) { setStatus("Choose a preset voice to preview."); return; }
    const storedPreview = getStoredPresetPreview(speaker);
    if (!storedPreview) {
      setPreviewVoice(null);
      setStatus(`No stored preview is installed for ${displaySpeaker(speaker)} yet. Preview will not generate audio.`);
      return;
    }
    setBusy(true);
    setPreviewVoice(speaker);
    setStatus(`Playing the stored ${displaySpeaker(speaker)} preview…`);
    try {
      setGeneratedAudio(storedPreview);
      const player = new Audio(storedPreview);
      player.preload = "auto";
      try { await player.play(); setStatus(`✓ ${displaySpeaker(speaker)} stored preview playing.`); }
      catch { setStatus(`✓ ${displaySpeaker(speaker)} stored preview ready — press Play below.`); }
    } catch (error) {
      setStatus(`Preview failed. ${error instanceof Error ? error.message : "The stored preview could not be played."}`);
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    setStatus("Generating your real Buddy voice…");
    try {
      const current = getBuddyVoiceProfile();
      if (current.mode === "clone" || current.speaker === "Red") {
        const sample = await getBuddyVoiceSample();
        if (!sample) throw new Error("Your voice sample is missing. Upload or record it again.");
        const referenceTranscript = current.referenceTranscript || REFERENCE_TRANSCRIPT;
        const result = await runLittleRedJob("voice-clone", { refAudio: sample, referenceAudio: sample, audio: sample, referenceTranscript, refText: referenceTranscript, target_text: CLONE_TEXT, text: CLONE_TEXT, language: current.language || "English" }, { privacy: "private", onStatus: setStatus });
        if (!result.url) throw new Error("The clone engine returned no playable audio.");
        setGeneratedAudio(result.url);
        await markBuddyCloneVerified(result.provider);
        setProfile(getBuddyVoiceProfile());
        setStatus("✓ REAL VOICE CLONE READY — press Play on the audio player below.");
        return;
      }
      const result = await runLittleRedJob("voice-clone", { speaker: normalizePresetSpeaker(current.speaker), language: current.language || "English", text: CLONE_TEXT, target_text: CLONE_TEXT, refText: REFERENCE_TRANSCRIPT }, { privacy: "personal", onStatus: setStatus });
      if (!result.url) throw new Error("The voice engine returned no playable audio.");
      setGeneratedAudio(result.url);
      setStatus("✓ Voice sample generated — press Play below.");
    } catch (error) {
      setStatus(`${FAILURE} ${error instanceof Error ? error.message : "The voice engine failed."}`);
    } finally { setBusy(false); }
  };

  const removeClone = async () => {
    await clearBuddyVoiceClone();
    setGeneratedAudio("");
    const next = getBuddyVoiceProfile();
    setProfile(next);
    setStatus("Voice clone removed. Upload or record a new sample to continue.");
  };

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3 shadow-sm">
      <div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-full bg-primary/10"><UserRound className="size-4 text-primary" /></div><div><h3 className="text-sm font-semibold">Buddy Voice Lab</h3><p className="text-[10px] text-muted-foreground">Local-first voice cloning for Buddy</p></div></div>
      <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => update({ mode: "preset" })} className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><Play className="mb-1 size-4 text-primary" /> Preset Voices<span className="mt-1 block text-[9px] text-muted-foreground">Stored samples — playback only</span></button><button type="button" onClick={() => update({ mode: "clone" })} className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><Mic2 className="mb-1 size-4 text-primary" /> Clone a Voice<span className="mt-1 block text-[9px] text-muted-foreground">Upload or record • no typing required</span></button></div>
      {profile.mode === "preset" ? <div className="mt-2 rounded-xl border border-border bg-background/40 p-2"><select value={presetCandidate} onChange={(e) => { setPresetCandidate(e.target.value); setPreviewVoice(null); setStatus("Preset selected for preview — it is not committed until you use this voice."); }} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs"><optgroup label="Stored Preset Voices">{allVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label} — {voice.note}</option>)}</optgroup></select><div className="mt-2 grid grid-cols-2 gap-2"><StudioButton type="button" className="w-full justify-center" onClick={() => void previewPreset()} disabled={busy}><Volume2 className="size-4" /> Preview Voice</StudioButton><button type="button" onClick={() => update({ mode: "preset", speaker: normalizePresetSpeaker(presetCandidate) })} disabled={busy} className="rounded-xl border border-primary bg-primary/10 px-3 py-2 text-xs font-semibold"><CheckCircle2 className="mr-1 inline size-4" /> Use This Voice</button></div>{audioUrl && previewVoice === normalizePresetSpeaker(presetCandidate) && <div className="mt-2 rounded-xl border border-primary/30 bg-background/70 p-2"><p className="mb-2 text-[10px] font-semibold text-primary">Preset voice preview</p><audio className="w-full" controls preload="auto" src={audioUrl} /></div>}<p role="status" aria-live="polite" className="mt-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">{status}</p></div> : <div className="mt-2 rounded-xl border border-primary/30 bg-background/60 p-3"><div className="flex items-center gap-2 text-sm font-semibold">{profile.cloneVerified ? <CheckCircle2 className="size-4 text-primary" /> : <Mic2 className="size-4 text-primary" />}{profile.cloneVerified ? "Your Voice Clone — READY" : "Create Your Voice Clone"}</div><p className="mt-1 text-[10px] text-muted-foreground">{profile.cloneVerified ? `Verified with ${profile.cloneProvider || "a real clone engine"}. Buddy can use it now.` : `Read this exact sentence for the strongest clone: “${REFERENCE_TRANSCRIPT}”`}</p><div className="mt-3 grid grid-cols-2 gap-2"><label className="cursor-pointer rounded-xl border border-border bg-background/50 px-3 py-3 text-center text-xs font-semibold"><Volume2 className="mx-auto mb-1 size-5 text-primary" /> Upload Sample<span className="mt-1 block text-[9px] font-normal text-muted-foreground">30–60 seconds</span><input className="sr-only" type="file" accept="audio/*" disabled={busy || recording} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadClone(file); e.currentTarget.value = ""; }} /></label>{recording ? <button type="button" onClick={stopRecording} disabled={busy} className="rounded-xl border border-primary bg-primary/10 px-3 py-3 text-center text-xs font-semibold"><Square className="mx-auto mb-1 size-5 text-primary" /> Stop Recording<span className="mt-1 block text-[9px] font-normal text-muted-foreground">Save this sample</span></button> : <button type="button" onClick={() => void startRecording()} disabled={busy} className="rounded-xl border border-border bg-background/50 px-3 py-3 text-center text-xs font-semibold"><Mic2 className="mx-auto mb-1 size-5 text-primary" /> Record Sample<span className="mt-1 block text-[9px] font-normal text-muted-foreground">Read the sentence above</span></button>}</div><p role="status" aria-live="polite" className="mt-3 rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">{status}</p><StudioButton type="button" className="mt-3 w-full justify-center" onClick={() => void test()} disabled={busy || recording} aria-busy={busy}><Mic2 className="size-4" /> {busy ? "Generating Your Voice…" : "Generate My Voice Clone"}</StudioButton>{audioUrl && <div className="mt-3 rounded-xl border border-primary/30 bg-background/70 p-2"><p className="mb-2 text-[10px] font-semibold text-primary">Your generated voice sample</p><audio className="w-full" controls preload="auto" src={audioUrl} /></div>}{profile.cloneVerified && <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-primary">Verified clone saved and ready for Buddy.</span><button type="button" onClick={() => void removeClone()} className="rounded-xl border border-border px-3 py-2 text-xs"><Trash2 className="mr-1 inline size-3.5" /> Remove</button></div>}</div>}
    </div>
  );
}
