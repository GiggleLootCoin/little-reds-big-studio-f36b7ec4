import { useEffect, useState } from "react";
import { Mic2, Play, Trash2, UserRound, Volume2 } from "lucide-react";
import { runStudioJob } from "@/lib/studio-runtime";
import { BUDDY_VOICE_PRESETS, clearBuddyVoiceClone, fileToVoiceDataUrl, getBuddyVoiceProfile, saveBuddyVoiceProfile } from "@/lib/buddy-voice";
import { StudioButton } from "./ui";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose Buddy's voice first. You can change it anytime.");
  useEffect(() => { const onStorage = () => setProfile(getBuddyVoiceProfile()); window.addEventListener("storage", onStorage); return () => window.removeEventListener("storage", onStorage); }, []);
  const update = (patch: Partial<typeof profile>) => { const next = { ...profile, ...patch }; setProfile(next); saveBuddyVoiceProfile(next); setStatus(next.mode === "clone" ? "Your saved voice is selected for Buddy." : `${next.speaker} is selected for Buddy.`); };
  const uploadClone = async (file: File) => {
    if (!file.type.startsWith("audio/")) return setStatus("Choose an audio file.");
    if (file.size > 3_500_000) return setStatus("Use a short, clear 2–30 second clip under 3.5 MB.");
    setBusy(true);
    try {
      const dataUrl = await fileToVoiceDataUrl(file); const audio = document.createElement("audio"); audio.preload = "metadata";
      const duration = await new Promise<number>((resolve, reject) => { audio.onloadedmetadata = () => resolve(audio.duration); audio.onerror = () => reject(new Error("The voice sample could not be read.")); audio.src = dataUrl; });
      if (!Number.isFinite(duration) || duration < 2 || duration > 30) throw new Error("Use a clear voice sample between 2 and 30 seconds.");
      update({ mode: "clone", referenceDataUrl: dataUrl, referenceName: file.name }); setStatus("Voice saved. Buddy will use it when a compatible voice engine is available.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Voice sample could not be saved."); } finally { setBusy(false); }
  };
  const browserPreview = (text: string) => {
    if (!("speechSynthesis" in window)) throw new Error("This browser does not provide speech playback.");
    const u = new SpeechSynthesisUtterance(text); u.lang = profile.language || navigator.language || "en-US"; u.rate = 0.98;
    const voices = speechSynthesis.getVoices(); const wanted = profile.speaker.toLowerCase();
    const match = voices.find(v => v.lang.toLowerCase().startsWith(u.lang.toLowerCase()) && v.name.toLowerCase().includes(wanted)); if (match) u.voice = match;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };
  const preview = async () => {
    setBusy(true); setStatus("Preparing Buddy's voice preview…");
    try {
      const current = getBuddyVoiceProfile(); const text = "Hi. I'm Buddy, and this is my voice from Little Red's Big Studio.";
      const input: Record<string, unknown> = { text, target_text: text, language: current.language };
      if (current.mode === "clone" && current.referenceDataUrl) input.referenceAudio = await (await fetch(current.referenceDataUrl)).blob(); else input.speaker = current.speaker;
      try { const result = await runStudioJob("tts", input, () => undefined); if (result.url) { const audio = new Audio(result.url); await audio.play(); setStatus("Voice preview is playing."); return; } } catch { /* use browser fallback */ }
      browserPreview(text); setStatus("Buddy's voice preview is playing using the device voice fallback.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Voice preview could not be played."); } finally { setBusy(false); }
  };
  return <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Volume2 className="size-4 text-primary"/><div><p className="text-xs font-bold uppercase tracking-[0.14em]">1. Choose Buddy's voice</p><p className="text-[10px] text-muted-foreground">Pick a voice now. Change it whenever you want.</p></div></div><StudioButton variant="ghost" onClick={() => void preview()} disabled={busy}><Play className="size-3.5"/> Preview</StudioButton></div>
    <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => update({ mode: "preset" })} className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><UserRound className="mb-1 size-4 text-primary"/> Preset voice</button><label className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}><Mic2 className="mb-1 size-4 text-primary"/> Use my voice<input className="sr-only" type="file" accept="audio/*" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadClone(file); event.currentTarget.value = ""; }}/></label></div>
    {profile.mode === "preset" ? <select value={profile.speaker} onChange={event => update({ speaker: event.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs">{BUDDY_VOICE_PRESETS.map(voice => <option key={voice.id} value={voice.id}>{voice.label} — {voice.note}</option>)}</select> : <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-background/50 px-3 py-2 text-xs"><span className="min-w-0 truncate">{profile.referenceName || "Saved voice sample"}</span><button type="button" onClick={() => { clearBuddyVoiceClone(); setProfile(getBuddyVoiceProfile()); setStatus("Returned Buddy to the selected preset voice."); }} aria-label="Remove saved voice"><Trash2 className="size-3.5"/></button></div>}
    <p className="mt-2 text-[10px] text-muted-foreground" aria-live="polite">{busy ? "Working… " : ""}{status}</p><p className="mt-1 text-[9px] text-muted-foreground">Only upload a voice you own or have permission to use.</p>
  </div>;
}