import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Paperclip, Phone, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { setBuddyStatus } from "@/lib/buddy-presence";
import { listMicrophones, requestMicrophone, stopMicrophone, describeMicrophoneError, type MicrophoneInfo } from "@/lib/microphone";
import { BuddyVoicePicker } from "./BuddyVoicePicker";
import { getBuddyVoiceProfile } from "@/lib/buddy-voice";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import "./BuddyVisual.css";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: number; attachments?: { id: string; name: string; type: string; size: number }[] };
const KEY = "lrbgs-buddy-chat-v3";

type MicPermission = "unknown" | "granted" | "denied";

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Buddy is ready.");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [micOptions, setMicOptions] = useState<MicrophoneInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");
  const [transcriptText, setTranscriptText] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const speechStartedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Message[];
      if (Array.isArray(saved)) setMessages(saved.slice(-50));
    } catch {}
    void refreshMicrophones();
    void checkMicrophonePermission();
    return () => stopAll();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-50))); } catch {}
  }, [messages]);

  async function checkMicrophonePermission() {
    try {
      if (!("permissions" in navigator) || !navigator.permissions?.query) return;
      const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
      setMicPermission(permission.state === "granted" ? "granted" : permission.state === "denied" ? "denied" : "unknown");
      permission.onchange = () => setMicPermission(permission.state === "granted" ? "granted" : permission.state === "denied" ? "denied" : "unknown");
    } catch {}
  }

  async function refreshMicrophones() {
    try { setMicOptions(await listMicrophones()); } catch { setMicOptions([]); }
  }

  async function openMicrophone() {
    try {
      setStatus("Opening your phone microphone…");
      const stream = await requestMicrophone(micId && micId !== "default" ? micId : undefined);
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") throw new Error("No live microphone stream was provided.");
      streamRef.current = stream;
      setMicPermission("granted");
      await refreshMicrophones();
      return stream;
    } catch (error) {
      setMicPermission("denied");
      const message = describeMicrophoneError(error);
      setStatus(message);
      setBuddyStatus("error", { message });
      return null;
    }
  }

  function stopSilenceMonitor() {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { audioContextRef.current?.close(); } catch {}
    audioContextRef.current = null;
  }

  function monitorSilence(stream: MediaStream) {
    if (!liveRef.current || !recorderRef.current) return;
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!liveRef.current || recorderRef.current?.state !== "recording") return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) { const n = (value - 128) / 128; sum += n * n; }
        const rms = Math.sqrt(sum / data.length);
        if (rms > 0.018) {
          speechStartedRef.current = true;
          if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        } else if (speechStartedRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = window.setTimeout(() => {
            silenceTimerRef.current = null;
            if (recorderRef.current?.state === "recording") recorderRef.current.stop();
          }, 850);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      window.setTimeout(() => {
        if (liveRef.current && recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, 6500);
    }
  }

  async function transcribe(blob: Blob) {
    if (!blob.size) throw new Error("I didn't catch any audio. Try again.");
    setStatus("Transcribing what you said…");
    const result = await runStudioJob("speech-to-text", { audio: blob }, setStatus);
    const text = artifactText(result.value).trim();
    if (!text) throw new Error("I couldn't understand that. Try again.");
    return text;
  }

  function startRecorder(stream: MediaStream, liveMode: boolean) {
    if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot capture microphone audio.");
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    speechStartedRef.current = false;
    recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      stopSilenceMonitor();
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      recorderRef.current = null;
      setRecording(false);
      if (!blob.size) {
        if (liveRef.current) setTimeout(() => void beginLive(), 250);
        return;
      }
      void transcribe(blob)
        .then((text) => {
          setTranscriptText(text);
          return answer(text, true);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Speech recognition failed.";
          setStatus(message);
          if (liveRef.current) setTimeout(() => void beginLive(), 500);
        });
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
    setBuddyStatus("listening", { message: "Buddy is listening…" });
    setStatus(liveMode ? "Listening… pause naturally or tap End Buddy." : "Recording… tap Stop when you're finished.");
    if (liveMode) monitorSilence(stream);
  }

  async function beginLive() {
    if (!liveRef.current || busyRef.current || speakingRef.current || recording) return;
    const stream = streamRef.current?.active ? streamRef.current : await openMicrophone();
    if (!stream) return;
    try { startRecorder(stream, true); } catch (error) { setStatus(error instanceof Error ? error.message : "Microphone capture failed."); }
  }

  async function toggleLive() {
    if (liveRef.current) {
      liveRef.current = false;
      setLive(false);
      try { recorderRef.current?.stop(); } catch {}
      stopSilenceMonitor();
      stopMicrophone(streamRef.current); streamRef.current = null;
      setRecording(false);
      setBuddyStatus("idle");
      setStatus("Buddy call ended.");
      return;
    }
    liveRef.current = true;
    setLive(true);
    setStatus("Opening your phone microphone…");
    await beginLive();
  }

  async function recordOnce() {
    if (busyRef.current || liveRef.current) return;
    if (recording) {
      stopRecording();
      return;
    }
    const stream = await openMicrophone();
    if (!stream) return;
    try { startRecorder(stream, false); } catch (error) { setStatus(error instanceof Error ? error.message : "Microphone capture failed."); }
  }

  function stopRecording() {
    try { recorderRef.current?.stop(); } catch {}
    stopSilenceMonitor();
    setRecording(false);
  }

  async function answer(text: string, spoken = false) {
    const clean = text.trim();
    if (!clean || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatus("Buddy is thinking…");
    const userMessage: Message = {
      id: crypto.randomUUID(), role: "user", content: clean, createdAt: Date.now(),
      attachments: attachments.map((file) => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size })),
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    try {
      const history = [...messages, userMessage].slice(-24).map((m) => ({ role: m.role, content: m.content }));
      const result = await runStudioJob("chat", { prompt: clean, text: clean, messages: history, history }, setStatus);
      const response = artifactText(result.value).trim();
      if (!response) throw new Error("Buddy did not return a response.");
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response, createdAt: Date.now() }]);
      setStatus("Buddy responded.");
      if (spoken || liveRef.current) await speak(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Buddy could not respond right now.";
      setStatus(message);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "I couldn't complete that response. Please try again.", createdAt: Date.now() }]);
      if (liveRef.current) setTimeout(() => void beginLive(), 700);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function speak(text: string) {
    if (muted || speakingRef.current) return;
    speakingRef.current = true;
    setBuddyStatus("working", { message: "Buddy is speaking…" });
    try {
      const voice = getBuddyVoiceProfile();
      const input: Record<string, unknown> = { text, target_text: text, language: voice.language, speaker: voice.speaker };
      if (voice.mode === "clone" && voice.referenceDataUrl) input.referenceAudio = await (await fetch(voice.referenceDataUrl)).blob();
      const result = await runStudioJob("tts", input, setStatus);
      if (!result.url) throw new Error("No usable voice was returned.");
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = result.url;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed"));
        void audio.play().catch(reject);
      });
    } catch {
      if ("speechSynthesis" in window) {
        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = navigator.language || "en-US";
          utterance.rate = 0.98;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        });
      }
    } finally {
      speakingRef.current = false;
      setBuddyStatus("idle");
      if (liveRef.current) setTimeout(() => void beginLive(), 180);
    }
  }

  function stopAll() {
    liveRef.current = false;
    stopSilenceMonitor();
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    stopMicrophone(streamRef.current); streamRef.current = null;
    try { audioRef.current?.pause(); } catch {}
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setAttachments((current) => [...current, ...Array.from(files)].slice(-6));
  }

  return (
    <section className="glass-panel overflow-hidden rounded-3xl border border-primary/25 shadow-[0_18px_60px_oklch(0_0_0_/_0.22)]">
      <div className="bg-gradient-to-r from-primary/15 via-background/60 to-primary/5 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <img src={buddyReference} alt="Buddy" className="size-14 rounded-2xl border border-primary/30 object-cover shadow-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-display text-lg font-bold">Buddy</h2></div>
            <p className="text-xs text-muted-foreground">Talk, type, attach, and switch between modes whenever you want.</p>
          </div>
          <button type="button" onClick={() => setMuted((v) => !v)} className="rounded-xl border border-border p-2" aria-label={muted ? "Unmute Buddy" : "Mute Buddy"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void toggleLive()} disabled={busy && !live} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-lg sm:flex-none ${live ? "bg-destructive text-destructive-foreground" : "crimson-gloss text-primary-foreground"}`}>
            <Phone className="size-4" />{live ? "End Buddy" : "Live Buddy"}
          </button>
          <button type="button" onClick={() => void recordOnce()} disabled={busy || live} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold sm:flex-none ${recording ? "border-primary bg-primary/10" : "border-border bg-background/70"}`}>
            {recording ? <MicOff className="size-4 text-primary" /> : <Mic className="size-4" />}{recording ? "Stop & Send" : "Tap to Talk"}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
          <span className={`size-2 rounded-full ${recording ? "bg-primary animate-pulse" : busy ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
          <span>{status}</span>
        </div>

        {micPermission === "denied" && (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
            <strong>Microphone access is blocked.</strong> Open Chrome site settings for this Studio, set <strong>Microphone</strong> to <strong>Allow</strong>, then tap <strong>Tap to Talk</strong> again.
          </div>
        )}

        {micPermission !== "granted" && micPermission !== "denied" && (
          <button type="button" onClick={() => void openMicrophone().then((stream) => { if (stream) { stopMicrophone(stream); streamRef.current = null; setStatus("Microphone ready. Tap to Talk when you're ready."); } })} className="mt-3 w-full rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold">
            Enable microphone
          </button>
        )}

        {micOptions.length > 1 && (
          <label className="mt-3 block text-[10px] text-muted-foreground">Microphone
            <select value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs">
              <option value="">Phone default</option>
              {micOptions.map((mic) => <option key={mic.id} value={mic.id}>{mic.label}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {messages.slice(-12).map((message) => (
          <div key={message.id} className={`rounded-2xl px-3 py-2.5 text-sm ${message.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-secondary/60"}`}>
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{message.role === "user" ? "You" : "Buddy"}</div>
            <p className="whitespace-pre-wrap leading-5">{message.content}</p>
          </div>
        ))}
        {transcriptText && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">You said: {transcriptText}</div>}
        {attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((file, index) => <button key={`${file.name}-${index}`} type="button" onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))} className="rounded-full border border-border px-3 py-1 text-[10px]">{file.name} ×</button>)}</div>}

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background/60 p-2">
          <label className="cursor-pointer rounded-xl p-2 hover:bg-secondary" aria-label="Attach files">
            <Paperclip className="size-5" />
            <input type="file" multiple accept="image/*,audio/*,video/*,.txt,.pdf" className="sr-only" onChange={(e) => handleFiles(e.target.files)} />
          </label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void answer(input); } }} placeholder="Talk to Buddy…" rows={1} className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" />
          <button type="button" onClick={() => void answer(input)} disabled={!input.trim() || busy} className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-40" aria-label="Send"><Send className="size-5" /></button>
        </div>
        <BuddyVoicePicker />
      </div>
    </section>
  );
}
