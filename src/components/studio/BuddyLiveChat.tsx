import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MicOff, MonitorUp, Paperclip, Phone, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { buildAgentSystemPrompt } from "@/lib/buddy-agent";
import { setBuddyStatus } from "@/lib/buddy-presence";
import { listMicrophones, requestMicrophone, stopMicrophone, describeMicrophoneError, type MicrophoneInfo } from "@/lib/microphone";
import { BuddyVoicePicker } from "./BuddyVoicePicker";
import { getBuddyVoiceProfile, getBuddyVoiceSample } from "@/lib/buddy-voice";
import { buildPresetTtsRequest } from "@/lib/buddy-preset-voice-routing";
import { getBuiltInRedVoiceSample } from "@/lib/red-default-voice";
import { captureBuddyCameraFrame, captureBuddyScreenFrame, getBuddyAwarenessCapabilities } from "@/lib/buddy-awareness";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import "./BuddyVisual.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: { id: string; name: string; type: string; size: number }[];
};
const KEY = "lrbgs-buddy-chat-v4";
const IDENTITY = "You are Buddy, Little Red's personal creative studio companion. Your name is Buddy. Never identify yourself as Qwen, an AI model, a provider, or another assistant. Do not mention hidden model/provider machinery unless explicitly asked. Speak like a real, attentive person: natural, concise, warm, direct, and quick to the useful point. Avoid canned filler, repetitive greetings, unnecessary disclaimers, and long preambles. Match the user's energy without becoming theatrical. When an image is attached, actually inspect it and answer what you can see. Use conversation context when provided. The final user message is the current turn: answer that message directly, do not repeat an earlier answer unless the user explicitly asks you to repeat it.";

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState(""), [busy, setBusy] = useState(false), [live, setLive] = useState(false), [recording, setRecording] = useState(false), [muted, setMuted] = useState(false), [status, setStatus] = useState("Buddy is ready."), [attachments, setAttachments] = useState<File[]>([]), [mics, setMics] = useState<MicrophoneInfo[]>([]), [micId, setMicId] = useState(""), [micPermission, setMicPermission] = useState("unknown"), [awareness, setAwareness] = useState(() => getBuddyAwarenessCapabilities()), [transcript, setTranscript] = useState("");
  const stream = useRef<MediaStream | null>(null), rec = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), audio = useRef<HTMLAudioElement | null>(null), liveRef = useRef(false), busyRef = useRef(false), speakingRef = useRef(false), silenceTimer = useRef<number | null>(null), raf = useRef<number | null>(null), ctx = useRef<AudioContext | null>(null), speech = useRef(false);

  useEffect(() => {
    try { const x = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(x)) setMessages(x.slice(-50)); } catch {}
    setAwareness(getBuddyAwarenessCapabilities());
    void listMicrophones().then(setMics).catch(() => setMics([]));
    return () => {
      liveRef.current = false;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      try { void ctx.current?.close(); } catch {}
      ctx.current = null;
      try { rec.current?.stop(); } catch {}
      rec.current = null;
      stopMicrophone(stream.current);
      stream.current = null;
      try { audio.current?.pause(); } catch {}
    };
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-50))); } catch {} }, [messages]);

  async function refreshMics() { try { setMics(await listMicrophones()); } catch { setMics([]); } }
  async function openMic() {
    try {
      setStatus("Opening your phone microphone…");
      const s = await requestMicrophone(micId && micId !== "default" ? micId : undefined);
      if (!s.getAudioTracks()[0]?.readyState) throw Error("No live microphone stream was provided.");
      stream.current = s; setMicPermission("granted"); await refreshMics(); return s;
    } catch (e) {
      setMicPermission("denied"); const m = describeMicrophoneError(e); setStatus(m); setBuddyStatus("error", { message: m }); return null;
    }
  }
  function stopMonitor() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current); silenceTimer.current = null;
    if (raf.current) cancelAnimationFrame(raf.current); raf.current = null;
    try { void ctx.current?.close(); } catch {} ctx.current = null;
  }
  function monitor(s: MediaStream) {
    try {
      const c = new AudioContext(), a = c.createAnalyser(), src = c.createMediaStreamSource(s); ctx.current = c; a.fftSize = 2048; src.connect(a); const d = new Uint8Array(a.fftSize);
      const tick = () => {
        if (!liveRef.current || rec.current?.state !== "recording") return;
        a.getByteTimeDomainData(d); let sum = 0; for (const v of d) { const n = (v - 128) / 128; sum += n * n; }
        const rms = Math.sqrt(sum / d.length);
        if (rms > 0.018) { speech.current = true; if (silenceTimer.current) clearTimeout(silenceTimer.current); silenceTimer.current = null; }
        else if (speech.current && !silenceTimer.current) silenceTimer.current = window.setTimeout(() => { silenceTimer.current = null; if (rec.current?.state === "recording") rec.current.stop(); }, 500);
        raf.current = requestAnimationFrame(tick);
      }; raf.current = requestAnimationFrame(tick);
    } catch { setStatus("Live microphone is active. Tap End Buddy when you finish speaking."); }
  }
  async function stt(blob: Blob) {
    if (!blob.size) throw Error("I didn't catch any audio. Try again."); setStatus("Transcribing what you said…");
    const r = await runStudioJob("speech-to-text", { audio: blob }, setStatus), t = artifactText(r.value).trim(); if (!t) throw Error("I couldn't understand that. Try again."); return t;
  }
  function start(s: MediaStream, isLive: boolean) {
    if (typeof MediaRecorder === "undefined") throw Error("This browser cannot capture microphone audio.");
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((x) => MediaRecorder.isTypeSupported(x));
    const r = type ? new MediaRecorder(s, { mimeType: type }) : new MediaRecorder(s); chunks.current = []; speech.current = false;
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => { stopMonitor(); const b = new Blob(chunks.current, { type: r.mimeType || "audio/webm" }); chunks.current = []; rec.current = null; setRecording(false); if (b.size) void stt(b).then((t) => { setTranscript(t); return answer(t, true); }).catch((e) => setStatus(e instanceof Error ? e.message : "Speech recognition failed.")); };
    rec.current = r; r.start(250); setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" }); setStatus(isLive ? "Listening… pause naturally or tap End Buddy." : "Recording… tap Stop & Send when you're finished."); if (isLive) monitor(s);
  }
  async function beginLive() { if (!liveRef.current || busyRef.current || speakingRef.current || rec.current) return; const s = stream.current?.active ? stream.current : await openMic(); if (s) try { start(s, true); } catch (e) { setStatus(e instanceof Error ? e.message : "Microphone capture failed."); } }
  async function toggleLive() {
    if (liveRef.current) { liveRef.current = false; setLive(false); try { rec.current?.stop(); } catch {} stopMonitor(); stopMicrophone(stream.current); stream.current = null; setRecording(false); setBuddyStatus("idle"); setStatus("Buddy call ended."); return; }
    liveRef.current = true; setLive(true); await beginLive();
  }
  async function recordOnce() {
    if (busyRef.current || liveRef.current) return;
    if (recording) { try { rec.current?.stop(); } catch {} stopMonitor(); return; }
    const s = await openMic(); if (s) try { start(s, false); } catch (e) { setStatus(e instanceof Error ? e.message : "Microphone capture failed."); }
  }
  async function captureAwareness(kind: "camera" | "screen") {
    if (busyRef.current) return;
    try {
      setStatus(kind === "camera" ? "Opening the camera…" : "Opening screen sharing…");
      const file = kind === "camera" ? await captureBuddyCameraFrame() : await captureBuddyScreenFrame();
      setAttachments((current) => [...current, file].slice(-6));
      setStatus(kind === "camera" ? "Camera frame captured. Ask Buddy what you want it to inspect." : "Screen frame captured. Ask Buddy what you want it to inspect.");
    } catch (error) { setStatus(error instanceof Error ? error.message : `${kind} awareness could not be captured.`); }
  }
  async function dataUrl(file: File) { return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error || new Error("Could not read attachment.")); r.readAsDataURL(file); }); }
  async function videoFrameDataUrl(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video"); video.preload = "metadata"; video.muted = true; video.playsInline = true; video.src = url;
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("The video attachment could not be decoded.")); });
      const width = Math.min(video.videoWidth || 1280, 1280), height = Math.min(video.videoHeight || 720, 720);
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d");
      if (!context) throw new Error("The video frame could not be rendered.");
      video.currentTime = 0; await new Promise<void>((resolve) => { video.onseeked = () => resolve(); }); context.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.84);
    } finally { URL.revokeObjectURL(url); }
  }
  async function attachmentContext(files: File[]) {
    const textParts: string[] = [];
    const imageParts: { type: string; image_url: { url: string } }[] = [];
    for (const file of files) {
      if (file.type.startsWith("image/")) imageParts.push({ type: "image_url", image_url: { url: await dataUrl(file) } });
      else if (file.type.startsWith("audio/")) {
        try { const r = await runStudioJob("speech-to-text", { audio: file }, setStatus); const t = artifactText(r.value).trim(); if (t) textParts.push(`Audio attachment "${file.name}" transcript:\n${t}`); }
        catch (error) { textParts.push(`Audio attachment "${file.name}" could not be transcribed: ${error instanceof Error ? error.message : String(error)}`); }
      } else if (file.type.startsWith("video/")) {
        try { imageParts.push({ type: "image_url", image_url: { url: await videoFrameDataUrl(file) } }); textParts.push(`Video attachment "${file.name}" is attached; Buddy is shown its first decoded frame.`); }
        catch (error) { textParts.push(`Video attachment "${file.name}" could not be decoded: ${error instanceof Error ? error.message : String(error)}`); }
      } else if (file.type === "text/plain" || file.type === "text/markdown" || file.type === "application/json" || file.type === "application/rtf") {
        const text = (await file.text()).slice(0, 12000); textParts.push(`Text attachment "${file.name}":\n${text}`);
      } else if (file.type === "application/pdf") textParts.push(`PDF attachment "${file.name}" is attached, but this browser path does not claim to have read PDF contents.`);
    }
    return { textParts, imageParts };
  }
  async function answer(text: string, spoken = false) {
    const clean = text.trim(); if (!clean || busyRef.current) return; busyRef.current = true; setBusy(true); setStatus("Buddy is thinking…");
    const u: Message = { id: crypto.randomUUID(), role: "user", content: clean, createdAt: Date.now(), attachments: attachments.map((f) => ({ id: crypto.randomUUID(), name: f.name, type: f.type, size: f.size })) };
    setMessages((x) => [...x, u]); setInput("");
    try {
      const prior = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const content: { type: string; text?: string; image_url?: { url: string } }[] = [{ type: "text", text: clean }];
      const attachmentInfo = await attachmentContext(attachments);
      if (attachmentInfo.textParts.length) content[0].text = `${clean}\n\n${attachmentInfo.textParts.join("\n\n")}`;
      content.push(...attachmentInfo.imageParts);
      const voiceProfile = getBuddyVoiceProfile(), language = voiceProfile.language || "English", mood = voiceProfile.mood || "natural", tone = voiceProfile.tone || "conversational";
      const systemPrompt = `${IDENTITY} ${buildAgentSystemPrompt()} Respond in ${language}. Your current mood is ${mood}; your conversational tone is ${tone}. Keep replies compact when the user asks something simple, but give enough detail when the task needs it. Do not switch back to English unless the user asks for English.`;
      const history = [{ role: "system", content: systemPrompt }, ...prior, { role: "user", content: content.length === 1 ? clean : content }];
      const r = await runStudioJob("chat", { prompt: clean, text: clean, messages: history, history, language, mood, tone }, setStatus), reply = artifactText(r.value).trim();
      if (!reply) throw Error("Buddy did not return a response.");
      setMessages((x) => [...x, { id: crypto.randomUUID(), role: "assistant", content: reply, createdAt: Date.now() }]); setAttachments([]); setStatus("Buddy responded."); if (spoken || liveRef.current) await speak(reply);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Buddy could not respond right now."); setMessages((x) => [...x, { id: crypto.randomUUID(), role: "assistant", content: "I couldn't complete that response. Please try again.", createdAt: Date.now() }]);
    } finally { busyRef.current = false; setBusy(false); if (liveRef.current && !speakingRef.current) setTimeout(() => void beginLive(), 250); }
  }
  async function speak(text: string) {
    if (muted || speakingRef.current) return; speakingRef.current = true; setBuddyStatus("working", { message: "Buddy is speaking…" }); const v = getBuddyVoiceProfile();
    try {
      let r;
      if (v.speaker === "Red" || (v.mode === "clone" && !v.speaker)) {
        let sample: Blob | null = null; if (v.mode === "clone") sample = await getBuddyVoiceSample(); else sample = await getBuiltInRedVoiceSample(); if (!sample) throw Error("The Red voice reference is unavailable right now.");
        r = await runStudioJob("tts", { refAudio: sample, referenceAudio: sample, audio: sample, referenceTranscript: v.referenceTranscript || "", refText: v.referenceTranscript || "", target_text: text, text, language: v.language || "English", mood: v.mood || "natural", tone: v.tone || "conversational", use_xvector_only: !v.referenceTranscript, model_size: liveRef.current ? "0.6B" : "1.7B" }, setStatus);
      } else {
        const preset = buildPresetTtsRequest(v, text); setStatus(`Speaking with ${preset.speaker}…`); const response = await fetch("/api/ai/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capability: "tts", text: preset.text, target_text: preset.text, language: preset.language, speaker: preset.speaker, mood: preset.mood, tone: preset.tone }) });
        if (!response.ok) { const detail = (await response.text().catch(() => "")).slice(0, 300); throw Error(`Preset voice generation failed (${response.status}). ${detail}`.trim()); }
        const blob = await response.blob(); if (!blob.size) throw Error("Preset voice generation returned empty audio."); r = { url: URL.createObjectURL(blob), provider: response.headers.get("x-voice-provider") || `Preset TTS (${preset.speaker})` };
      }
      if (!r.url) throw Error("No usable Buddy voice was returned."); const a = audio.current ?? new Audio(); audio.current = a; a.preload = "auto"; a.src = r.url;
      await new Promise<void>((ok, no) => { a.onended = () => ok(); a.onerror = () => no(Error("Audio playback failed")); void a.play().catch(no); });
    } catch (error) { setStatus(error instanceof Error ? error.message : "Buddy's selected voice could not be generated."); throw error; }
    finally { speakingRef.current = false; setBuddyStatus("idle"); if (liveRef.current) setTimeout(() => void beginLive(), 250); }
  }
  function stopAll() { liveRef.current = false; stopMonitor(); try { rec.current?.stop(); } catch {} rec.current = null; stopMicrophone(stream.current); stream.current = null; try { audio.current?.pause(); } catch {} }

  return (
    <section className="glass-panel overflow-hidden rounded-3xl border border-primary/25 shadow-[0_18px_60px_oklch(0_0_0_/_0.22)]">
      <div className="bg-gradient-to-r from-primary/15 via-background/60 to-primary/5 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <img src={buddyReference} alt="Buddy" className="size-14 rounded-2xl border border-primary/30 object-cover shadow-lg" />
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-display text-lg font-bold">Buddy</h2></div><p className="text-xs text-muted-foreground">Set Buddy up once, then talk, type, attach, and switch modes whenever you want.</p></div>
          <button type="button" onClick={() => setMuted((v) => !v)} className="rounded-xl border border-border p-2" aria-label={muted ? "Unmute Buddy" : "Mute Buddy"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
        </div>
        <div className="mt-4 space-y-3">
          <BuddyVoicePicker />
          <div className="rounded-2xl border border-primary/20 bg-background/50 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em]">2. Enable your microphone</p><p className="mt-1 text-[10px] text-muted-foreground">Tap the button below. Chrome must receive this user action before it can show its microphone permission prompt.</p>
            {micPermission !== "granted" && <button type="button" onClick={() => void openMic().then((s) => { if (s) { stopMicrophone(s); stream.current = null; setStatus("Microphone ready."); } })} className="mt-2 w-full rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground">{micPermission === "denied" ? "Open microphone access again" : "Enable microphone"}</button>}
            {micPermission === "granted" && <p className="mt-2 text-xs font-semibold text-green-500">Microphone ready.</p>}
            {mics.length > 1 && <label className="mt-3 block text-[10px] text-muted-foreground">Microphone<select value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs"><option value="">Phone default</option>{mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>}
          </div>
          <div className="rounded-2xl border border-primary/20 bg-background/50 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Buddy awareness</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Capture one explicit camera or screen frame, then Buddy can inspect that image in the next message.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={!awareness.camera || busy} onClick={() => void captureAwareness("camera")} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><Camera className="size-4" />Camera</button>
              <button type="button" disabled={!awareness.screen || busy} onClick={() => void captureAwareness("screen")} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><MonitorUp className="size-4" />Screen</button>
            </div>
            {!awareness.camera && !awareness.screen && <p className="mt-2 text-[10px] text-muted-foreground">Awareness capture is not supported by this browser.</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void toggleLive()} disabled={busy && !live} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-lg sm:flex-none ${live ? "bg-destructive text-destructive-foreground" : "crimson-gloss text-primary-foreground"}`}><Phone className="size-4" />{live ? "End Buddy" : "Live Buddy"}</button>
          <button type="button" onClick={() => void recordOnce()} disabled={busy || live} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold sm:flex-none ${recording ? "border-primary bg-primary/10" : "border-border bg-background/70"}`}>{recording ? <MicOff className="size-4 text-primary" /> : <Mic className="size-4" />}{recording ? "Stop & Send" : "Tap to Talk"}</button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite"><span className={`size-2 rounded-full ${recording ? "bg-primary animate-pulse" : busy ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} /><span>{status}</span></div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {messages.slice(-12).map((m) => <div key={m.id} className={`rounded-2xl px-3 py-2.5 text-sm ${m.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-secondary/60"}`}><div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{m.role === "user" ? "You" : "Buddy"}</div><p className="whitespace-pre-wrap leading-5">{m.content}</p></div>)}
        {transcript && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">You said: {transcript}</div>}
        {attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((f, i) => <button key={`${f.name}-${i}`} type="button" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} className="rounded-full border border-border px-3 py-1 text-[10px]">{f.name} ×</button>)}</div>}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background/60 p-2">
          <label className="cursor-pointer rounded-xl p-2 hover:bg-secondary" aria-label="Attach files"><Paperclip className="size-5" /><input type="file" multiple accept="image/*,audio/*,video/*,.txt,.pdf" className="sr-only" onChange={(e) => setAttachments((x) => [...x, ...Array.from(e.target.files || [])].slice(-6))} /></label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void answer(input); } }} placeholder="Talk to Buddy…" rows={1} className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" />
          <button type="button" onClick={() => void answer(input)} disabled={!input.trim() || busy} className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-40" aria-label="Send"><Send className="size-5" /></button>
        </div>
      </div>
    </section>
  );
}
