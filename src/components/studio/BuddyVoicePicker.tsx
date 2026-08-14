import { useMemo, useState } from "react";
import { CheckCircle2, Mic2, Play, RotateCcw, Trash2, UserRound, Volume2 } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { clearBuddyVoiceClone, fileToVoiceDataUrl, getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified, saveBuddyVoiceProfile, saveBuddyVoiceSample } from "@/lib/buddy-voice";
import { BUDDY_MOODS, BUDDY_TONES, BUDDY_VOICE_PRESETS } from "@/lib/buddy-voice";
import { BUDDY_EXPANDED_LANGUAGES, BUDDY_EXPANDED_VOICES } from "@/lib/buddy-voice-expanded";
import { StudioButton } from "./ui";

const CLONE_TEXT = "Hi. I'm Buddy from Little Red's Big Studio. This is a voice-clone test. The voice you supplied is speaking these words.";
const FAILURE = "Buddy couldn't get that voice ready just yet. Try Test again or choose another voice.";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Pick a voice, language, mood and tone. Test it before making it Buddy's voice.");
  const allVoices = useMemo(() => [
    ...BUDDY_VOICE_PRESETS.map((v) => ({ ...v, family: "Buddy Originals" })),
    ...BUDDY_EXPANDED_VOICES.map((v) => ({ ...v, family: "Aura Studio — 40 distinct English voices" })),
  ], []);
  const update = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next); saveBuddyVoiceProfile(next);
    const voice = allVoices.find((v) => v.id === next.speaker);
    setStatus(next.mode === "clone" ? next.cloneVerified ? "✓ Your verified clone is ready for Buddy." : "Your reference is saved; the clone still needs a real generated sample." : `${voice?.label || next.speaker} selected — ${voice?.note || "ready to test"}.`);
  };
  const runClone = async (sample: Blob, current = getBuddyVoiceProfile()) => {
    const result = await runStudioJob("voice-clone", {
      refAudio: sample, referenceAudio: sample, audio: sample,
      referenceTranscript: current.referenceTranscript || "", refText: current.referenceTranscript || "",
      target_text: CLONE_TEXT, text: CLONE_TEXT, language: current.language || "English",
      model_size: "1.7B", mood: current.mood, tone: current.tone,
    }, setStatus);
    if (!result.url) throw new Error("The clone engine returned no playable audio.");
    return result;
  };
  const uploadClone = async (file: File) => {
    if (!file.type.startsWith("audio/")) return setStatus("Please choose an audio recording.");
    if (file.size > 3_500_000) return setStatus("Use a clear 3–30 second recording under 3.5 MB.");
    setBusy(true); setStatus("Saving your reference and generating a real clone…");
    try {
      const dataUrl = await fileToVoiceDataUrl(file), audio = document.createElement("audio"); audio.preload = "metadata";
      const duration = await new Promise<number>((resolve, reject) => { audio.onloadedmetadata = () => resolve(audio.duration); audio.onerror = () => reject(new Error("The recording could not be read.")); audio.src = dataUrl; });
      if (!Number.isFinite(duration) || duration < 3 || duration > 30) throw new Error("Use a clear voice recording between 3 and 30 seconds.");
      await saveBuddyVoiceSample(file);
      let transcript = "";
      try { transcript = artifactText((await runStudioJob("speech-to-text", { audio: file }, setStatus)).value).trim(); } catch { /* x-vector fallback remains available */ }
      const next = { ...getBuddyVoiceProfile(), mode: "clone" as const, referenceDataUrl: dataUrl, referenceName: file.name, referenceTranscript: transcript, cloneVerified: false, cloneVerifiedAt: undefined, cloneProvider: undefined };
      saveBuddyVoiceProfile(next); setProfile(next);
      const saved = await getBuddyVoiceSample(); if (!saved) throw new Error("The saved reference could not be retrieved.");
      const result = await runClone(saved, next);
      await markBuddyCloneVerified(result.provider); setProfile(getBuddyVoiceProfile());
      const player = new Audio(result.url!); await player.play();
      setStatus(`✓ REAL CLONE VERIFIED — ${result.provider}. Your clone is now a usable Buddy voice.`);
    } catch (error) { setStatus(`${FAILURE} ${error instanceof Error ? error.message : "The clone service did not return usable audio."}`); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setStatus("Testing the selected voice…");
    try {
      const current = getBuddyVoiceProfile();
      if (current.mode === "clone") {
        const sample = await getBuddyVoiceSample(); if (!sample) throw new Error("Your saved voice reference is missing.");
        const result = await runClone(sample, current); const player = new Audio(result.url!); await player.play();
        if (!current.cloneVerified) { await markBuddyCloneVerified(result.provider); setProfile(getBuddyVoiceProfile()); }
        setStatus(`✓ REAL CLONE VERIFIED — ${result.provider}.`); return;
      }
      const result = await runStudioJob("tts", { text: CLONE_TEXT, target_text: CLONE_TEXT, language: current.language || "English", speaker: current.speaker, mood: current.mood, tone: current.tone, instruction: `Use a ${current.mood || "natural"} mood and ${current.tone || "conversational"} tone. Sound human and spontaneous.` }, setStatus);
      if (!result.url) throw new Error("No playable audio returned.");
      const player = new Audio(result.url); await player.play();
      setStatus(`✓ ${allVoices.find((v) => v.id === current.speaker)?.label || current.speaker} is working.`);
    } catch { setStatus(FAILURE); }
    finally { setBusy(false); }
  };
  const removeClone = async () => { await clearBuddyVoiceClone(); const next = getBuddyVoiceProfile(); setProfile(next); setStatus("Your clone was removed. Buddy is back on preset voices."); };
  return <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Volume2 className="size-4 text-primary" /><div><p className="text-xs font-bold uppercase tracking-[0.14em]">Buddy's voice studio</p><p className="text-[10px] text-muted-foreground">50 distinct preset identities, multilingual routing, and your verified voice clone.</p></div></div><StudioButton variant="ghost" onClick={() => void test()} disabled={busy}><Play className="size-3.5" /> Test selected</StudioButton></div>
    <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => update({ mode: "preset", cloneVerified: false })} className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><UserRound className="mb-1 size-4 text-primary" /> Preset voices<span className="mt-1 block text-[9px] text-muted-foreground">Real selectable speaker IDs</span></button><label className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><Mic2 className="mb-1 size-4 text-primary" /> Clone your voice<span className="mt-1 block text-[9px] text-muted-foreground">3–30 sec reference • real verification</span><input className="sr-only" type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadClone(f); e.currentTarget.value = ""; }} /></label></div>
    {profile.mode === "preset" ? <select value={profile.speaker} onChange={(e) => update({ speaker: e.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs">{["Buddy Originals", "Aura Studio — 40 distinct English voices"].map((family) => <optgroup key={family} label={family}>{allVoices.filter((v) => v.family === family).map((voice) => <option key={voice.id} value={voice.id}>{voice.label} — {voice.note}</option>)}</optgroup>)}</select> : <div className="mt-2 rounded-xl border border-primary/30 bg-background/60 p-3"><div className="flex items-center gap-2 text-sm font-semibold">{profile.cloneVerified ? <CheckCircle2 className="size-4 text-primary" /> : <Mic2 className="size-4 text-primary" />} Your Voice Clone {profile.cloneVerified ? "— READY" : "— REFERENCE SAVED"}</div><p className="mt-1 text-[10px] text-muted-foreground">{profile.cloneVerified ? `Verified with ${profile.cloneProvider || "a real clone engine"}. Buddy can use it now.` : "The upload alone does not count as a clone. Buddy shows READY only after generated audio is returned and played."}</p><div className="mt-2 flex flex-wrap gap-2"><StudioButton variant="ghost" onClick={() => void test()} disabled={busy}><Play className="size-3.5" /> {profile.cloneVerified ? "Play my clone" : "Generate + verify"}</StudioButton><button type="button" onClick={() => void removeClone()} className="rounded-xl border border-border px-3 py-2 text-xs"><Trash2 className="mr-1 inline size-3.5" /> Remove</button><label className="rounded-xl border border-border px-3 py-2 text-xs cursor-pointer"><RotateCcw className="mr-1 inline size-3.5" /> Re-record<input className="sr-only" type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadClone(f); e.currentTarget.value = ""; }} /></label></div></div>}
    <div className="mt-2 grid grid-cols-3 gap-2"><label className="text-[10px] font-semibold text-muted-foreground">Language<select value={profile.language || "English"} onChange={(e) => update({ language: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground">{BUDDY_EXPANDED_LANGUAGES.map((language) => <option key={language}>{language}</option>)}</select></label><label className="text-[10px] font-semibold text-muted-foreground">Mood<select value={profile.mood || "natural"} onChange={(e) => update({ mood: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground">{BUDDY_MOODS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label className="text-[10px] font-semibold text-muted-foreground">Tone<select value={profile.tone || "conversational"} onChange={(e) => update({ tone: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground">{BUDDY_TONES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label></div>
    <p className="mt-2 text-[10px] text-muted-foreground" aria-live="polite">{busy ? "Working… " : ""}{status}</p><p className="mt-1 text-[9px] text-muted-foreground">Only clone a voice you own or have permission to use.</p>
  </div>;
}
