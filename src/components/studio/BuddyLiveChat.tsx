import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { setBuddyStatus } from "@/lib/buddy-presence";
import { chooseMicrophone, describeMicrophoneError, listMicrophones, requestMicrophone, stopMicrophone, type MicrophoneInfo } from "@/lib/microphone";
import { Panel, StudioButton } from "./ui";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import "./BuddyVisual.css";

type Message = { role: "user" | "assistant"; content: string };
type Mode = "idle" | "live" | "record";
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; abort: () => void;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>> }) => void) | null;
};
const KEY = "lrbgs-buddy-chat";
const recognitionCtor = () => (window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as Window & { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [live, setLive] = useState(false); const [recording, setRecording] = useState(false); const [muted, setMuted] = useState(false); const [status, setStatus] = useState("Buddy is ready."); const [micOptions, setMicOptions] = useState<MicrophoneInfo[]>([]); const [micId, setMicId] = useState(""); const [transcript, setTranscript] = useState("");
  const streamRef = useRef<MediaStream | null>(null); const recorderRef = useRef<MediaRecorder | null>(null); const recognitionRef = useRef<Recognition | null>(null); const chunksRef = useRef<Blob[]>([]); const audioRef = useRef<HTMLAudioElement | null>(null); const modeRef = useRef<Mode>("idle"); const liveRef = useRef(false); const busyRef = useRef(false); const speakingRef = useRef(false); const recognitionTextRef = useRef("");

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Message[]; if (Array.isArray(saved)) setMessages(saved.slice(-30)); } catch {}
    void refreshMicrophones();
    const onDeviceChange = () => void refreshMicrophones(); navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => { navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange); stopRecognition(); try { recorderRef.current?.stop(); } catch {} stopMicrophone(streamRef.current); streamRef.current = null; audioRef.current?.pause(); window.speechSynthesis?.cancel(); };
    // Stable mount-only initialization; refs own capture state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-30))); } catch {} }, [messages]);

  async function refreshMicrophones() {
    try {
      const devices = await listMicrophones();
      setMicOptions(devices);
      // NEVER auto-select a physical device. An empty selection means Android/Chrome's
      // current OS default, which is normally the built-in phone microphone.
      setMicId((current) => current);
    } catch { setMicOptions([]); }
  }
  async function openMicrophone() {
    try {
      const requestedId = micId && micId !== "default" ? micId : undefined;
      const stream = await requestMicrophone(requestedId);
      const devices = await listMicrophones(); setMicOptions(devices);
      streamRef.current = stream;
      return stream;
    } catch (error) { const message = describeMicrophoneError(error); setStatus(message); setBuddyStatus("error", { message }); return null; }
  }
  function stopRecognition() { const recognition = recognitionRef.current; recognitionRef.current = null; if (recognition) { try { recognition.onend = null; recognition.abort(); } catch {} } }
  function cleanupCapture() { stopRecognition(); try { recorderRef.current?.stop(); } catch {} recorderRef.current = null; stopMicrophone(streamRef.current); streamRef.current = null; setRecording(false); }
  async function transcribeBlob(blob: Blob) {
    if (!blob.size) throw new Error("I didn't catch any audio. Try again.");
    const stt = await runStudioJob("speech-to-text", { audio: blob }, (s) => setStatus(s));
    const text = artifactText(stt.value).trim(); if (!text) throw new Error("Speech recognition returned no usable text."); return text;
  }
  function startMediaRecorder(mode: Mode, stream: MediaStream) {
    if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record microphone audio.");
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); chunksRef.current = []; modeRef.current = mode;
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }); chunksRef.current = []; recorderRef.current = null; stopMicrophone(streamRef.current); streamRef.current = null; setRecording(false); const captureMode = modeRef.current; modeRef.current = "idle"; if (captureMode !== "idle") void transcribeBlob(blob).then((text) => captureMode === "record" ? setTranscript(text) : answer(text, true)).catch((error) => setStatus(error instanceof Error ? error.message : "Speech recognition failed.")); };
    recorderRef.current = recorder; recorder.start(250); setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" }); setStatus(mode === "live" ? "Listening… speak naturally, then pause." : "Recording… tap stop when you're done.");
  }
  function startBrowserRecognition(mode: Mode) {
    const Ctor = recognitionCtor(); if (!Ctor) return false; const recognition = new Ctor(); recognition.continuous = mode === "live"; recognition.interimResults = true; recognition.lang = localStorage.getItem("buddy-language") || navigator.language || "en-US"; recognitionTextRef.current = ""; modeRef.current = mode; recognitionRef.current = recognition;
    recognition.onstart = () => { setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" }); setStatus("Listening…"); };
    recognition.onresult = (event) => { let text = ""; for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript; recognitionTextRef.current = `${recognitionTextRef.current} ${text}`.trim(); if (mode === "record") setTranscript(recognitionTextRef.current); };
    recognition.onerror = (event) => { if (event.error === "not-allowed" || event.error === "service-not-allowed") setStatus("Microphone/speech permission was denied. Allow access for this site and try again."); else if (event.error !== "aborted") setStatus("Browser speech recognition is unavailable; using the Studio speech engine."); };
    recognition.onend = () => { const text = recognitionTextRef.current.trim(); recognitionRef.current = null; setRecording(false); if (!text) { if (liveRef.current && mode === "live" && !speakingRef.current) setTimeout(() => void beginCapture("live"), 250); else setStatus("I didn't catch that. Try again."); return; } if (mode === "record") { setTranscript(text); setStatus("Transcription ready. Edit it or send it to Buddy."); modeRef.current = "idle"; } else { modeRef.current = "idle"; void answer(text, true); } };
    try { recognition.start(); return true; } catch { recognitionRef.current = null; return false; }
  }
  async function beginCapture(mode: Mode) {
    if (busyRef.current || speakingRef.current || recording) return;
    // Let Android Chrome's SpeechRecognition use the phone's own microphone first.
    // This avoids selecting a stale USB/Bluetooth input just because enumerateDevices()
    // happened to expose it first. If unavailable, fall back to getUserMedia+MediaRecorder.
    if (!micId && startBrowserRecognition(mode)) return;
    const stream = await openMicrophone(); if (!stream) return;
    try { startMediaRecorder(mode, stream); } catch (error) { stopMicrophone(stream); streamRef.current = null; setStatus(error instanceof Error ? error.message : "Recording is unavailable."); }
  }
  function stopCapture() { stopRecognition(); try { recorderRef.current?.stop(); } catch {} setRecording(false); }

  async function speak(text: string) {
    if (muted || speakingRef.current) return;
    speakingRef.current = true; setBuddyStatus("working", { message: "Buddy is speaking…" });
    try {
      const result = await runStudioJob("tts", { text, target_text: text }, setStatus);
      if (!result.url) throw new Error("No voice artifact returned.");
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = result.url; audioRef.current.onended = () => { speakingRef.current = false; if (liveRef.current) void beginCapture("live"); else setBuddyStatus("idle"); }; audioRef.current.onerror = () => { throw new Error("Buddy audio could not be played."); };
      await audioRef.current.play(); setStatus("Buddy is speaking…");
    } catch {
      // Android/browser speech is the final no-key, no-download fallback. Prime the
      // speech engine from the live user gesture and resume it before speaking.
      if ("speechSynthesis" in window) {
        window.speechSynthesis.resume();
        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(text); utterance.lang = localStorage.getItem("buddy-language") || navigator.language || "en-US"; utterance.rate = 0.98; utterance.pitch = 1.02;
          utterance.onend = () => resolve(); utterance.onerror = () => resolve(); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
        });
      }
      speakingRef.current = false; setStatus(liveRef.current ? "Listening…" : "Buddy is ready."); if (liveRef.current) void beginCapture("live"); else setBuddyStatus("idle");
    }
  }
  async function answer(text: string, speakReply = false) {
    const clean = text.trim(); if (!clean || busyRef.current) return; busyRef.current = true; setBusy(true); setBuddyStatus("thinking", { message: "Buddy is thinking…" }); const next = [...messages, { role: "user" as const, content: clean }].slice(-16); setMessages(next); setInput("");
    try {
      const prompt = [{ role: "system" as const, content: "You are Buddy from Little Red's Big Studio: a sharp, warm, funny creative partner for music and YouTube. Never claim an action happened unless the Studio returned a verified result. Be concise and useful." }, ...next];
      const result = await runStudioJob("chat", { prompt, text: clean, messages: prompt }, setStatus); const reply = artifactText(result.value).replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); if (!reply) throw new Error("Buddy returned no usable response.");
      setMessages([...next, { role: "assistant", content: reply }]); setStatus("Buddy is ready."); setBuddyStatus("success", { message: "Buddy is ready." }); if (speakReply || liveRef.current) void speak(reply);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Buddy's free routes are temporarily unavailable."); setBuddyStatus("error", { message: "Buddy could not complete that response." }); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function stopAll() { liveRef.current = false; modeRef.current = "idle"; stopRecognition(); try { recorderRef.current?.stop(); } catch {} stopMicrophone(streamRef.current); streamRef.current = null; setRecording(false); audioRef.current?.pause(); window.speechSynthesis?.cancel(); speakingRef.current = false; setBuddyStatus("idle"); }
  async function toggleLive() { if (liveRef.current) { stopAll(); setLive(false); setStatus("Call ended. Buddy is ready."); return; } liveRef.current = true; setLive(true); setStatus("Connecting to Buddy…"); window.speechSynthesis?.resume(); await beginCapture("live"); if (!recognitionRef.current && !recorderRef.current) { liveRef.current = false; setLive(false); } }
  function sendTyped() { void answer(input, true); }
  function sendTranscript() { const text = transcript.trim(); if (text) { setTranscript(""); void answer(text, true); } }

  return (
    <Panel eyebrow="BUDDY • LIVE" title="Call Buddy" icon={<Sparkles className="size-5" />} defaultOpen>
      <div className="relative overflow-hidden rounded-[1.7rem] border border-primary/30 bg-[radial-gradient(circle_at_50%_15%,oklch(0.35_0.14_25_/_0.65),transparent_48%),linear-gradient(145deg,oklch(0.07_0.02_20),oklch(0.15_0.04_20))] p-5 shadow-[0_24px_70px_oklch(0_0_0_/_0.42)] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/20 blur-3xl" /><div className="relative flex flex-col items-center text-center">
          <div className={`relative size-32 rounded-full border border-primary/35 bg-black/35 p-2 shadow-[0_0_50px_oklch(0.58_0.24_26_/_0.25)] sm:size-40 ${live ? "animate-pulse-glow" : ""}`}><div className="buddy-aura absolute inset-3 rounded-full bg-primary/25 blur-xl" /><img src={buddyReference} alt="Buddy" className="buddy-character-image relative h-full w-full object-contain" /></div>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary"><span className={`size-2 rounded-full ${live ? "animate-pulse bg-primary" : "bg-muted-foreground/50"}`} />{live ? recording ? "Listening" : busy ? "Thinking" : "Connected" : "Ready"}</div>
          <h3 className="mt-2 font-display text-xl font-black sm:text-2xl">{live ? "Buddy is with you" : "Talk to Buddy"}</h3><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{live ? "Speak naturally. Pause and Buddy answers, then listens again." : "One tap for a phone-call-style conversation. You can also record a message or type."}</p>
          <button type="button" onClick={() => void toggleLive()} className={`mt-5 flex min-h-12 items-center gap-2 rounded-full px-6 py-3 font-display text-sm font-black shadow-xl transition-transform active:scale-95 ${live ? "border border-primary/40 bg-background/70 text-foreground" : "crimson-gloss text-primary-foreground"}`}><Phone className="size-4" />{live ? "End Buddy Call" : "Call Buddy"}</button>
        </div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Microphone</span><Mic className="size-4 text-primary" /></div><select value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-2 w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"><option value="">Automatic phone microphone</option>{micOptions.map((mic) => <option key={mic.id} value={mic.id}>{mic.label}</option>)}</select></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Voice</span>{muted ? <VolumeX className="size-4 text-muted-foreground" /> : <Volume2 className="size-4 text-primary" />}</div><button type="button" onClick={() => setMuted((v) => !v)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold">{muted ? "Voice muted" : "Voice on"}</button></div>
        </div>
        {recording && <div className="mt-3 flex items-center justify-center gap-2 text-xs text-primary"><span className="size-2 animate-pulse rounded-full bg-primary" />{status}</div>}
        <div className="mt-5 rounded-2xl border border-border/60 bg-background/55 p-3"><div className="flex gap-2"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTyped(); } }} placeholder="Type to Buddy…" className="min-w-0 flex-1 rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm outline-none focus:border-primary" /><StudioButton onClick={sendTyped} disabled={busy || !input.trim()}><Send className="size-4" /></StudioButton></div>
          <div className="mt-3 flex flex-wrap gap-2"><StudioButton variant="ghost" onClick={() => void beginCapture("record")} disabled={recording || busy}><Mic className="size-4" />Record → Text</StudioButton>{recording && <StudioButton variant="ghost" onClick={stopCapture}><MicOff className="size-4" />Stop</StudioButton>}{transcript && <StudioButton variant="ghost" onClick={sendTranscript}><Send className="size-4" />Send transcript</StudioButton>}</div></div>
        <div className="mt-4 max-h-64 space-y-2 overflow-auto pr-1">{messages.length === 0 ? <p className="py-5 text-center text-xs text-muted-foreground">Buddy is ready when you are.</p> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-muted/60"}`}><div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{message.role === "user" ? "You" : "Buddy"}</div>{message.content}</div>)}</div>
      </div>
    </Panel>
  );
}
