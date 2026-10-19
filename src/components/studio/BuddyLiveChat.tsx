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
import { playBuddyAudio, unlockBuddyAudio } from "@/lib/buddy-audio-unlock";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import "./BuddyVisual.css";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: number; attachments?: { id: string; name: string; type: string; size: number }[] };
type BrowserSpeechRecognition = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type BrowserSpeechConstructor = new () => BrowserSpeechRecognition;
type NativeBuddyBridge = { nativeSpeechAvailable?: () => boolean; microphoneGranted?: () => boolean; requestMicrophone?: () => boolean; startNativeListening?: (language: string) => boolean; stopNativeListening?: () => void; startNativeAudioCapture?: () => boolean; stopNativeAudioCapture?: () => void; localBrainInstalled?: () => boolean; localBrainModelName?: () => string; downloadLocalBrain?: () => void; localBrainChat?: (prompt: string, systemPrompt: string, maxTokens: number) => void; releaseLocalBrain?: () => void };
const KEY = "lrbgs-buddy-chat-v4";
const IDENTITY = "You are Buddy, Little Red's personal creative studio companion. Your name is Buddy. Never identify yourself as Qwen, an AI model, a provider, or another assistant. Do not mention hidden model/provider machinery unless explicitly asked. Speak like a real, attentive person: natural, concise, warm, direct, and quick to the useful point. Avoid canned filler, repetitive greetings, unnecessary disclaimers, and long preambles. Match the user's energy without becoming theatrical. When an image is attached, actually inspect it and answer what you can see. Use conversation context when provided. The final user message is the current turn: answer that message directly, do not repeat an earlier answer unless the user explicitly asks you to repeat it.";

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState(""), [busy, setBusy] = useState(false), [live, setLive] = useState(false), [recording, setRecording] = useState(false), [muted, setMuted] = useState(false), [status, setStatus] = useState("Buddy is ready."), [attachments, setAttachments] = useState<File[]>([]), [mics, setMics] = useState<MicrophoneInfo[]>([]), [micId, setMicId] = useState(""), [micPermission, setMicPermission] = useState("unknown"), [awareness, setAwareness] = useState(() => getBuddyAwarenessCapabilities()), [transcript, setTranscript] = useState(""), [localBrainInstalled, setLocalBrainInstalled] = useState(false), [localBrainDownloading, setLocalBrainDownloading] = useState(false), [localBrainProgress, setLocalBrainProgress] = useState(0);
  const stream = useRef<MediaStream | null>(null), rec = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), audio = useRef<HTMLAudioElement | null>(null), liveRef = useRef(false), busyRef = useRef(false), speakingRef = useRef(false), silenceTimer = useRef<number | null>(null), raf = useRef<number | null>(null), ctx = useRef<AudioContext | null>(null), speech = useRef(false), liveWatchdog = useRef<number | null>(null);
  const nativeSpeech = useRef<BrowserSpeechRecognition | null>(null), nativeTranscript = useRef(""), nativeSpeechAvailable = useRef(false), nativeAudioActive = useRef(false), nativeAudioLive = useRef(false);

  function browserSpeechConstructor(): BrowserSpeechConstructor | null { if (typeof window === "undefined") return null; const w = window as typeof window & { SpeechRecognition?: BrowserSpeechConstructor; webkitSpeechRecognition?: BrowserSpeechConstructor }; return w.SpeechRecognition || w.webkitSpeechRecognition || null; }
  function androidBridge(): NativeBuddyBridge | null {
    if (typeof window === "undefined") return null;
    return (window as typeof window & { AndroidBuddyVoice?: NativeBuddyBridge }).AndroidBuddyVoice ?? null;
  }
  function stopNativeSpeech() {
    const bridge = androidBridge();
    try { bridge?.stopNativeListening?.(); } catch {}
    const current = nativeSpeech.current;
    nativeSpeech.current = null;
    if (current) { try { current.stop(); } catch {} }
  }
  function startNativeSpeech(): boolean {
    stopNativeSpeech();
    nativeTranscript.current = "";
    const bridge = androidBridge();
    const language = String(getBuddyVoiceProfile().language || "en-US").replace("English", "en-US");

    if (bridge?.nativeSpeechAvailable?.()) {
      nativeSpeechAvailable.current = true;
      try {
        const started = bridge.startNativeListening?.(language);
        if (started) return true;
      } catch {}
      nativeSpeechAvailable.current = false;
      setStatus("Android speech recognition is unavailable; using Buddy's microphone capture instead.");
    }

    const Constructor = browserSpeechConstructor();
    nativeSpeechAvailable.current = Boolean(Constructor);
    if (!Constructor) return false;
    try {
      const recognition = new Constructor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = language;
      recognition.onresult = (event) => {
        const parts: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result?.isFinal && result[0]?.transcript) parts.push(result[0].transcript);
        }
        if (parts.length) {
          nativeTranscript.current = parts.join(" ").trim();
          setTranscript(nativeTranscript.current);
          if (liveRef.current && rec.current?.state === "recording") { try { rec.current.stop(); } catch {} }
        }
      };
      recognition.onerror = () => undefined;
      recognition.onend = () => {
        if (liveRef.current && rec.current?.state === "recording" && nativeSpeech.current === recognition) {
          try { recognition.start(); } catch {}
        }
      };
      nativeSpeech.current = recognition;
      recognition.start();
      return true;
    } catch {
      nativeSpeech.current = null;
      nativeSpeechAvailable.current = false;
      return false;
    }
  }
  function localBrainChat(prompt: string, systemPrompt: string): Promise<string> {
    const bridge = androidBridge();
    if (!bridge?.localBrainChat) return Promise.reject(new Error("Local Buddy brain is not available in this APK."));
    return new Promise((resolve, reject) => {
      const w = window as typeof window & { __buddyLocalBrainResult?: (text: string) => void; __buddyLocalBrainError?: (message: string) => void };
      const oldResult = w.__buddyLocalBrainResult, oldError = w.__buddyLocalBrainError;
      const timer = window.setTimeout(() => { w.__buddyLocalBrainResult = oldResult; w.__buddyLocalBrainError = oldError; reject(new Error("Local Buddy brain timed out.")); }, 90000);
      w.__buddyLocalBrainResult = (text) => { window.clearTimeout(timer); w.__buddyLocalBrainResult = oldResult; w.__buddyLocalBrainError = oldError; const clean = String(text || "").trim(); clean ? resolve(clean) : reject(new Error("Local Buddy brain returned an empty response.")); };
      w.__buddyLocalBrainError = (message) => { window.clearTimeout(timer); w.__buddyLocalBrainResult = oldResult; w.__buddyLocalBrainError = oldError; reject(new Error(String(message || "Local Buddy brain failed."))); };
      try { bridge.localBrainChat?.(prompt, systemPrompt, 250); } catch (error) { window.clearTimeout(timer); w.__buddyLocalBrainResult = oldResult; w.__buddyLocalBrainError = oldError; reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }
  function installLocalBrain() {
    const bridge = androidBridge();
    if (!bridge?.downloadLocalBrain) { setStatus("Local GGUF brain is available only in the native Android APK."); return; }
    if (localBrainDownloading) return;
    setLocalBrainDownloading(true); setLocalBrainProgress(0); setStatus("Downloading Buddy's local brain…");
    try { bridge.downloadLocalBrain(); } catch (error) { setLocalBrainDownloading(false); setStatus(error instanceof Error ? error.message : "Could not start the local brain download."); }
  }
  useEffect(() => {
    try { const x = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(x)) setMessages(x.slice(-50)); } catch {}
    setAwareness(getBuddyAwarenessCapabilities());
    const w = typeof window === "undefined" ? null : window as typeof window & {
      __buddyNativeSpeechResult?: (text: string) => void;
      __buddyNativeSpeechState?: (state: string) => void;
      __buddyNativeSpeechError?: (code: number) => void;
      __buddyNativeAudioResult?: (base64: string, mime: string) => void;
      __buddyLocalBrainResult?: (text: string) => void;
      __buddyLocalBrainError?: (message: string) => void;
      __buddyLocalBrainProgress?: (percent: number, downloaded: number, total: number) => void;
      __buddyLocalBrainInstalled?: () => void;
    };
    if (w) {
      setLocalBrainInstalled(Boolean(androidBridge()?.localBrainInstalled?.()));
      w.__buddyLocalBrainProgress = (percent) => { setLocalBrainDownloading(true); if (percent >= 0) setLocalBrainProgress(percent); setStatus(percent >= 0 ? "Downloading Buddy's local brain… " + percent + "%" : "Downloading Buddy's local brain…"); };
      w.__buddyLocalBrainInstalled = () => { setLocalBrainDownloading(false); setLocalBrainProgress(100); setLocalBrainInstalled(true); setStatus("Buddy's local brain is installed. It will be used automatically if online chat is unavailable."); };
      w.__buddyLocalBrainError = (message) => { setLocalBrainDownloading(false); setStatus(String(message || "Local Buddy brain download failed.")); };
      w.__buddyNativeSpeechState = (state) => {
        if (state === "ready" || state === "listening") {
          setMicPermission("granted");
          setRecording(true);
          setStatus(liveRef.current ? "Listening…" : "Listening… speak to Buddy.");
        }
      };
      w.__buddyNativeSpeechResult = (text) => {
        const clean = String(text || "").trim();
        setRecording(false);
        nativeTranscript.current = clean;
        if (!clean) { setStatus("I didn't catch that. Try again."); return; }
        setTranscript(clean);
        void answer(clean, true).catch((e) => setStatus(e instanceof Error ? e.message : "Buddy could not respond."));
      };
      w.__buddyNativeSpeechError = (code) => {
        setRecording(false);
        if (liveRef.current && code !== 7) setStatus("Buddy's microphone connection was interrupted. Try speaking again.");
        else setStatus(code === 7 ? "I didn't catch that. Try again." : "Buddy's phone speech recognition could not hear you.");
      };
      w.__buddyNativeAudioResult = (base64, mime) => {
        nativeAudioActive.current = false;
        setRecording(false);
        if (!base64) {
          if (liveRef.current) setTimeout(() => void beginLive(), 200);
          else setStatus("I didn't catch any audio. Try again.");
          return;
        }
        try {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: mime || "audio/wav" });
          if (!blob.size) throw new Error("Empty microphone recording.");
          void stt(blob).then((t) => {
            setTranscript(t);
            return answer(t, true);
          }).catch((e) => {
            setStatus(e instanceof Error ? e.message : "Speech recognition failed.");
            if (liveRef.current) setTimeout(() => void beginLive(), 300);
          });
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Buddy could not read the microphone recording.");
          if (liveRef.current) setTimeout(() => void beginLive(), 300);
        }
      };
    }
    void listMicrophones().then(setMics).catch(() => setMics([]));
    return () => {
      liveRef.current = false;
      stopNativeSpeech();
      if (w) { delete w.__buddyNativeSpeechResult; delete w.__buddyNativeSpeechState; delete w.__buddyNativeSpeechError; delete w.__buddyNativeAudioResult; delete w.__buddyLocalBrainResult; delete w.__buddyLocalBrainError; delete w.__buddyLocalBrainProgress; delete w.__buddyLocalBrainInstalled; }
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
  async function openMic(forceBrowser = false) {
    const bridge = androidBridge();
    // On Android WebView, explicitly obtain the app-level RECORD_AUDIO
    // permission before calling getUserMedia. This is important when the
    // browser/WebView permission layer has not yet been granted: otherwise
    // getUserMedia can fail without ever lighting the microphone indicator.
    if (forceBrowser && bridge?.microphoneGranted && !bridge.microphoneGranted()) {
      try {
        bridge.requestMicrophone?.();
        setStatus("Allow microphone access for Buddy in the Android prompt.");
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (bridge.microphoneGranted?.()) break;
        }
        if (!bridge.microphoneGranted?.()) {
          setMicPermission("denied");
          setStatus("Android microphone permission was not granted.");
          return null;
        }
      } catch {
        setMicPermission("denied");
        setStatus("Buddy could not request the phone microphone.");
        return null;
      }
    }
    try {
      setStatus("Opening your phone microphone…");
      const s = await requestMicrophone(micId && micId !== "default" ? micId : undefined);
      if (!s.getAudioTracks()[0]?.readyState) throw Error("No live microphone stream was provided.");
      stream.current = s;
      setMicPermission("granted");
      await refreshMics();
      return s;
    } catch (e) {
      setMicPermission("denied");
      const m = describeMicrophoneError(e);
      setStatus(m);
      setBuddyStatus("error", { message: m });
      return null;
    }
  }
  function stopMonitor() { if (silenceTimer.current) clearTimeout(silenceTimer.current); silenceTimer.current = null; if (raf.current) cancelAnimationFrame(raf.current); raf.current = null; try { void ctx.current?.close(); } catch {} ctx.current = null; }
  function monitor(s: MediaStream) { try { const c = new AudioContext(), a = c.createAnalyser(), src = c.createMediaStreamSource(s); ctx.current = c; a.fftSize = 2048; src.connect(a); const d = new Uint8Array(a.fftSize); const tick = () => { if (!liveRef.current || rec.current?.state !== "recording") return; a.getByteTimeDomainData(d); let sum = 0; for (const v of d) { const n = (v - 128) / 128; sum += n * n; } const rms = Math.sqrt(sum / d.length); if (rms > 0.018) { speech.current = true; if (silenceTimer.current) clearTimeout(silenceTimer.current); silenceTimer.current = null; } else if (speech.current && !silenceTimer.current) silenceTimer.current = window.setTimeout(() => { silenceTimer.current = null; if (rec.current?.state === "recording") rec.current.stop(); }, 1200); raf.current = requestAnimationFrame(tick); }; raf.current = requestAnimationFrame(tick); } catch { setStatus("Live microphone is active. Tap End Buddy when you finish speaking."); } }
  async function stt(blob: Blob) { if (!blob.size) throw Error("I didn't catch any audio. Try again."); setStatus("Transcribing what you said…"); try { const r = await runStudioJob("speech-to-text", { audio: blob }, setStatus); const t = artifactText(r.value).trim(); if (!t) throw Error("I couldn't understand that. Try again."); return t; } catch (error) { const browserText = nativeTranscript.current.trim(); if (browserText) { setStatus("Speech service is busy; using your phone's speech recognition."); return browserText; } throw error; } }
  function start(s: MediaStream, isLive: boolean) { if (typeof MediaRecorder === "undefined") throw Error("This browser cannot capture microphone audio."); const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((x) => MediaRecorder.isTypeSupported(x)); const r = type ? new MediaRecorder(s, { mimeType: type }) : new MediaRecorder(s); chunks.current = []; speech.current = false; r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); }; r.onstop = () => { stopMonitor(); const fastTranscript = nativeTranscript.current.trim(); stopNativeSpeech(); const b = new Blob(chunks.current, { type: r.mimeType || "audio/webm" }); chunks.current = []; rec.current = null; setRecording(false); if (!isLive) { stopMicrophone(s); if (stream.current === s) stream.current = null; } if (fastTranscript) { setTranscript(fastTranscript); void answer(fastTranscript, true).catch((e) => setStatus(e instanceof Error ? e.message : "Buddy could not respond.")); } else if (b.size) void stt(b).then((t) => { setTranscript(t); return answer(t, true); }).catch((e) => setStatus(e instanceof Error ? e.message : "Speech recognition failed.")); }; rec.current = r; r.start(250); setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" }); setStatus(isLive ? "Listening… pause naturally or tap End Buddy." : "Recording… tap Stop & Send when you're finished."); if (isLive) monitor(s); }
  async function beginLive() {
    if (!liveRef.current || busyRef.current || speakingRef.current) return;
    if (rec.current || nativeAudioActive.current) return;
    const bridge = androidBridge();
    if (bridge?.microphoneGranted?.() && bridge.startNativeAudioCapture) {
      try {
        const started = bridge.startNativeAudioCapture();
        if (started) {
          nativeAudioActive.current = true;
          nativeAudioLive.current = true;
          setMicPermission("granted");
          setRecording(true);
          setStatus("Listening… pause naturally when you finish speaking.");
          setBuddyStatus("listening", { message: "Buddy is listening…" });
          return;
        }
      } catch {}
    }
    const s = stream.current?.active ? stream.current : await openMic(true);
    if (s) try {
      start(s, true);
      liveWatchdog.current = window.setTimeout(() => {
        if (liveRef.current && rec.current?.state === "recording") setStatus("I am still listening. Tap End Buddy when you finish.");
      }, 15000);
    } catch (e) { setStatus(e instanceof Error ? e.message : "Microphone capture failed."); }
  }
  async function toggleLive() { if (liveRef.current) { liveRef.current = false; setLive(false); stopNativeSpeech(); if (liveWatchdog.current) clearTimeout(liveWatchdog.current); liveWatchdog.current = null; try { rec.current?.stop(); } catch {} stopMonitor(); stopMicrophone(stream.current); stream.current = null; setRecording(false); setBuddyStatus("idle"); setStatus("Buddy call ended."); return; } void unlockBuddyAudio(); liveRef.current = true; setLive(true); await beginLive(); }
  async function recordOnce() {
    if (busyRef.current || liveRef.current) return;
    if (recording) {
      stopNativeSpeech();
      try { rec.current?.stop(); } catch {}
      stopMonitor();
      setRecording(false);
      return;
    }
    void unlockBuddyAudio();
    const bridge = androidBridge();
    if (bridge?.microphoneGranted?.() && bridge.startNativeAudioCapture) {
      try {
        const started = bridge.startNativeAudioCapture();
        if (started) {
          nativeAudioActive.current = true;
          nativeAudioLive.current = false;
          setMicPermission("granted");
          setRecording(true);
          setStatus("Listening… pause naturally when you finish speaking.");
          setBuddyStatus("listening", { message: "Buddy is listening…" });
          return;
        }
      } catch {}
    }
    const s = await openMic(true);
    if (s) try { start(s, false); } catch (e) { setStatus(e instanceof Error ? e.message : "Microphone capture failed."); }
  }
  async function captureAwareness(kind: "camera" | "screen") { if (busyRef.current) return; try { setStatus(kind === "camera" ? "Opening the camera…" : "Opening screen sharing…"); const file = kind === "camera" ? await captureBuddyCameraFrame() : await captureBuddyScreenFrame(); setAttachments((current) => [...current, file].slice(-6)); setStatus(kind === "camera" ? "Camera frame captured. Ask Buddy what you want it to inspect." : "Screen frame captured. Ask Buddy what you want it to inspect."); } catch (error) { setStatus(error instanceof Error ? error.message : `${kind} awareness could not be captured.`); } }
  async function dataUrl(file: File) { return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error || new Error("Could not read attachment.")); r.readAsDataURL(file); }); }
  async function videoFrameDataUrl(file: File): Promise<string> { const url = URL.createObjectURL(file); try { const video = document.createElement("video"); video.preload = "metadata"; video.muted = true; video.playsInline = true; video.src = url; await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("The video attachment could not be decoded.")); }); const width = Math.min(video.videoWidth || 1280, 1280), height = Math.min(video.videoHeight || 720, 720); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) throw new Error("The video frame could not be rendered."); video.currentTime = 0; await new Promise<void>((resolve) => { video.onseeked = () => resolve(); }); context.drawImage(video, 0, 0, width, height); return canvas.toDataURL("image/jpeg", 0.84); } finally { URL.revokeObjectURL(url); } }
  async function attachmentContext(files: File[]) { const textParts: string[] = []; const imageParts: { type: string; image_url: { url: string } }[] = []; for (const file of files) { if (file.type.startsWith("image/")) imageParts.push({ type: "image_url", image_url: { url: await dataUrl(file) } }); else if (file.type.startsWith("audio/")) { try { const r = await runStudioJob("speech-to-text", { audio: file }, setStatus); const t = artifactText(r.value).trim(); if (t) textParts.push(`Audio attachment "${file.name}" transcript:\n${t}`); } catch (error) { textParts.push(`Audio attachment "${file.name}" could not be transcribed: ${error instanceof Error ? error.message : String(error)}`); } } else if (file.type.startsWith("video/")) { try { imageParts.push({ type: "image_url", image_url: { url: await videoFrameDataUrl(file) } }); textParts.push(`Video attachment "${file.name}" is attached; Buddy is shown its first decoded frame.`); } catch (error) { textParts.push(`Video attachment "${file.name}" could not be decoded: ${error instanceof Error ? error.message : String(error)}`); } } else if (file.type === "text/plain" || file.type === "text/markdown" || file.type === "application/json" || file.type === "application/rtf") { const text = (await file.text()).slice(0, 12000); textParts.push(`Text attachment "${file.name}":\n${text}`); } else if (file.type === "application/pdf") textParts.push(`PDF attachment "${file.name}" is attached, but this browser path does not claim to have read PDF contents.`); } return { textParts, imageParts }; }
  async function answer(text: string, spoken = false) {
    const clean = text.trim(); if (!clean || busyRef.current) return;
    await unlockBuddyAudio();
    busyRef.current = true; setBusy(true); setStatus("Buddy is thinking…");
    const u: Message = { id: crypto.randomUUID(), role: "user", content: clean, createdAt: Date.now(), attachments: attachments.map((f) => ({ id: crypto.randomUUID(), name: f.name, type: f.type, size: f.size })) };
    setMessages((x) => [...x, u]); setInput("");
    try {
      const prior = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const content: { type: string; text?: string; image_url?: { url: string } }[] = [{ type: "text", text: clean }];
      const attachmentInfo = await attachmentContext(attachments); if (attachmentInfo.textParts.length) content[0].text = `${clean}\n\n${attachmentInfo.textParts.join("\n\n")}`; content.push(...attachmentInfo.imageParts);
      const voiceProfile = getBuddyVoiceProfile(), language = voiceProfile.language || "English", mood = voiceProfile.mood || "natural", tone = voiceProfile.tone || "conversational";
      const systemPrompt = `${IDENTITY} ${buildAgentSystemPrompt()} Respond in ${language}. Your current mood is ${mood}; your conversational tone is ${tone}. Keep replies compact when the user asks something simple, but give enough detail when the task needs it. Do not switch back to English unless the user asks for English.`;
      const history = [{ role: "system", content: systemPrompt }, ...prior, { role: "user", content: content.length === 1 ? clean : content }];
      const r = await runStudioJob("chat", { prompt: clean, text: clean, messages: history, history, language, mood, tone, max_tokens: 250, maxTokens: 250 }, setStatus), reply = artifactText(r.value).trim(); if (!reply) throw Error("Buddy did not return a response.");
      setMessages((x) => [...x, { id: crypto.randomUUID(), role: "assistant", content: reply, createdAt: Date.now() }]); setAttachments([]);
      // Buddy voice is the normal response mode. Typed messages must use the same voice path as spoken/live messages; otherwise a user can explicitly test voice and receive text only without any playback attempt.
      if (!muted) {
        try {
          await speak(reply);
          setStatus("Buddy responded with audio.");
        } catch (voiceError) {
          // A successful text response must never be replaced by a generic
          // chat failure just because the selected voice engine failed.
          const detail = voiceError instanceof Error ? voiceError.message : String(voiceError);
          setStatus("Buddy answered, but audio could not play. " + detail);
        }
      } else setStatus("Buddy responded.");
    } catch (e) {
      const onlineError = e instanceof Error ? e.message : String(e);
      if (localBrainInstalled && attachmentInfo.textParts.length === 0 && attachmentInfo.imageParts.length === 0) {
        try {
          setStatus("Online Buddy is unavailable. Switching to the local GGUF brain…");
          const localHistory = prior.slice(-8).map((m) => (m.role === "user" ? "You: " : "Buddy: ") + m.content).join("\n");
          const localPrompt = localHistory ? localHistory + "\nYou: " + clean + "\nBuddy:" : clean;
          const reply = await localBrainChat(localPrompt, systemPrompt);
          setMessages((x) => [...x, { id: crypto.randomUUID(), role: "assistant", content: reply, createdAt: Date.now() }]);
          setAttachments([]);
          if (!muted) { try { await speak(reply); setStatus("Buddy responded using the local brain and Red voice."); } catch (voiceError) { setStatus("Buddy answered locally, but audio could not play. " + (voiceError instanceof Error ? voiceError.message : String(voiceError))); } } else setStatus("Buddy responded using the local brain.");
          return;
        } catch (localError) {
          setStatus("Online and local Buddy brains failed. " + onlineError);
        }
      } else setStatus(onlineError || "Buddy could not respond right now.");
      setMessages((x) => [...x, { id: crypto.randomUUID(), role: "assistant", content: "I couldn't complete that response. Please try again.", createdAt: Date.now() }]);
    }
    finally { busyRef.current = false; setBusy(false); if (liveRef.current && !speakingRef.current) setTimeout(() => void beginLive(), 250); }
  }
  async function playGeneratedAudioNatively(url: string): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const bridge = (window as typeof window & { AndroidBuddyVoice?: { playBase64Async?: (base64: string, mimeType: string, callbackId: string) => void } }).AndroidBuddyVoice;
    if (!bridge?.playBase64Async || !url) return false;
    try {
      const response = await fetch(url);
      if (!response.ok) return false;
      const blob = await response.blob();
      if (!blob.size) return false;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const base64 = btoa(binary);
      const callbackId = "audio-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => { if (settled) return; settled = true; window.clearTimeout(timer); delete (window as typeof window & { __buddyAndroidTtsCallbacks?: Record<string, (ok: boolean) => void> }).__buddyAndroidTtsCallbacks?.[callbackId]; resolve(ok); };
        const timer = window.setTimeout(() => finish(false), 30000);
        const callbacks = ((window as typeof window & { __buddyAndroidTtsCallbacks?: Record<string, (ok: boolean) => void> }).__buddyAndroidTtsCallbacks ??= {});
        callbacks[callbackId] = finish;
        (window as typeof window & { __buddyAndroidTtsResult?: (id: string, ok: boolean) => void }).__buddyAndroidTtsResult ??= (id, ok) => { (window as typeof window & { __buddyAndroidTtsCallbacks?: Record<string, (ok: boolean) => void> }).__buddyAndroidTtsCallbacks?.[id]?.(ok); };
        bridge.playBase64Async?.(base64, blob.type || "audio/mpeg", callbackId);
      });
    } catch { return false; }
  }

  async function speak(text: string) {
    if (muted || speakingRef.current) return;
    speakingRef.current = true;
    setBuddyStatus("working", { message: "Buddy is speaking…" });
    const v = getBuddyVoiceProfile();
    const isRedClone = v.mode === "clone" || (v.mode === "preset" && v.speaker === "Red");
    // AndroidBuddyVoice is used by playGeneratedAudioNatively so generated
    // clone audio reaches the phone speaker through the native MediaPlayer path.
    try {
      // IMPORTANT: a saved Red clone must never be pre-empted by Android's
      // generic system TTS. The previous implementation did exactly that:
      // native TTS ran first and returned on success, so the actual Red clone
      // engine was never reached on Android.
      //
      // Clone routing is authoritative. Native Android TTS is only an
      // emergency fallback AFTER the selected clone/preset audio path fails.
      let r: { url: string; provider?: string };
      if (v.speaker === "Red" || (v.mode === "clone" && !v.speaker)) {
        let sample: Blob | null = null;
        if (v.mode === "clone") sample = await getBuddyVoiceSample();
        else sample = await getBuiltInRedVoiceSample();
        if (!sample) throw Error("The Red voice reference is unavailable right now.");

        // Red is the selected voice, so every recovery path must still be Red.
        // Never substitute a generic Aura/phone voice merely because cloning is
        // slower than a few seconds. The production route now falls through to
        // the independent free/open clone pool when its primary route fails.
        r = await runStudioJob("tts", {
          refAudio: sample, referenceAudio: sample, audio: sample,
          referenceTranscript: v.referenceTranscript || "",
          refText: v.referenceTranscript || "",
          target_text: text, text,
          language: v.language || "English",
          mood: v.mood || "natural",
          tone: v.tone || "conversational",
          use_xvector_only: !v.referenceTranscript,
          model_size: "0.6B",
        }, setStatus) as unknown as { url: string; provider?: string };
      } else {
        const preset = buildPresetTtsRequest(v, text);
        setStatus(`Speaking with ${preset.speaker}…`);
        const response = await fetch("/api/ai/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ capability: "tts", text: preset.text, target_text: preset.text, language: preset.language, speaker: preset.speaker, mood: preset.mood, tone: preset.tone }),
        });
        if (!response.ok) {
          const detail = (await response.text().catch(() => "")).slice(0, 300);
          throw Error(`Preset voice generation failed (${response.status}). ${detail}`.trim());
        }
        const blob = await response.blob();
        if (!blob.size) throw Error("Preset voice generation returned empty audio.");
        r = { url: URL.createObjectURL(blob), provider: response.headers.get("x-voice-provider") || `Preset TTS (${preset.speaker})` };
      }
      if (!r.url) throw Error("No usable Buddy voice was returned.");
      const nativePlayed = await playGeneratedAudioNatively(r.url);
      if (!nativePlayed) await playBuddyAudio(r.url);
      if (r.url.startsWith("blob:")) URL.revokeObjectURL(r.url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Do not silently substitute the phone's generic voice for a selected
      // Red clone. That would make the UI look successful while the requested
      // voice is actually broken.
      const playbackError = new Error(
        `Buddy audio failed. ${detail || "No usable audio playback path is available."}`,
      );
      setStatus(playbackError.message);
      throw playbackError;
    } finally {
      speakingRef.current = false;
      setBuddyStatus("idle");
    }
  }
  function stopAll() { liveRef.current = false; stopNativeSpeech(); if (liveWatchdog.current) clearTimeout(liveWatchdog.current); liveWatchdog.current = null; stopMonitor(); try { rec.current?.stop(); } catch {} rec.current = null; stopMicrophone(stream.current); stream.current = null; try { audio.current?.pause(); } catch {} }

  return (<section className="glass-panel overflow-hidden rounded-3xl border border-primary/25 shadow-[0_18px_60px_oklch(0_0_0_/_0.22)]"><div className="bg-gradient-to-r from-primary/15 via-background/60 to-primary/5 p-4 sm:p-5"><div className="flex items-center gap-3"><img src={buddyReference} alt="Buddy" className="size-14 rounded-2xl border border-primary/30 object-cover shadow-lg" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-display text-lg font-bold">Buddy</h2></div><p className="text-xs text-muted-foreground">Set Buddy up once, then talk, type, attach, and switch modes whenever you want.</p></div><button type="button" onClick={() => setMuted((v) => !v)} className="rounded-xl border border-border p-2" aria-label={muted ? "Unmute Buddy" : "Mute Buddy"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button></div><div className="mt-4 space-y-3"><BuddyVoicePicker /><div className="rounded-2xl border border-primary/20 bg-background/50 p-3"><p className="text-xs font-bold uppercase tracking-[0.14em]">2. Enable your microphone</p><p className="mt-1 text-[10px] text-muted-foreground">Tap the button below. the browser must receive this user action before it can show its microphone permission prompt.</p>{micPermission !== "granted" && <button type="button" onClick={() => void openMic().then((s) => { if (s) { stopMicrophone(s); stream.current = null; setStatus("Microphone ready."); } })} className="mt-2 w-full rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground">{micPermission === "denied" ? "Open microphone access again" : "Enable microphone"}</button>}{micPermission === "granted" && <p className="mt-2 text-xs font-semibold text-green-500">Microphone ready.</p>}{mics.length > 1 && <label className="mt-3 block text-[10px] text-muted-foreground">Microphone<select value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs"><option value="">Phone default</option>{mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>}</div><div className="rounded-2xl border border-primary/20 bg-background/50 p-3"><p className="text-xs font-bold uppercase tracking-[0.14em]">Local Buddy brain</p><p className="mt-1 text-[10px] text-muted-foreground">{localBrainInstalled ? "GGUF brain installed. If online chat fails, Buddy can keep talking offline." : "Optional offline backup: install a small GGUF brain directly on this phone. The APK stays small; the model is downloaded once."}</p>{!localBrainInstalled && <button type="button" disabled={localBrainDownloading} onClick={installLocalBrain} className="mt-2 w-full rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold disabled:opacity-50">{localBrainDownloading ? "Downloading… " + localBrainProgress + "%" : "Install local Buddy brain (~485 MB)"}</button>}{localBrainInstalled && <p className="mt-2 text-[10px] font-semibold text-green-500">Local GGUF brain ready.</p>}</div><div className="rounded-2xl border border-primary/20 bg-background/50 p-3"><p className="text-xs font-bold uppercase tracking-[0.14em]">Buddy awareness</p><p className="mt-1 text-[10px] text-muted-foreground">Capture one explicit camera or screen frame, then Buddy can inspect that image in the next message.</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={!awareness.camera || busy} onClick={() => void captureAwareness("camera")} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><Camera className="size-4" />Camera</button><button type="button" disabled={!awareness.screen || busy} onClick={() => void captureAwareness("screen")} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><MonitorUp className="size-4" />Screen</button></div>{!awareness.camera && !awareness.screen && <p className="mt-2 text-[10px] text-muted-foreground">Awareness capture is not supported by this browser.</p>}</div></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void toggleLive()} disabled={busy && !live} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-lg sm:flex-none ${live ? "bg-destructive text-destructive-foreground" : "crimson-gloss text-primary-foreground"}`}><Phone className="size-4" />{live ? "End Buddy" : "Live Buddy"}</button><button type="button" onClick={() => void recordOnce()} disabled={busy || live} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold sm:flex-none ${recording ? "border-primary bg-primary/10" : "border-border bg-background/70"}`}>{recording ? <MicOff className="size-4 text-primary" /> : <Mic className="size-4" />}{recording ? "Stop & Send" : "Tap to Talk"}</button></div><div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite"><span className={`size-2 rounded-full ${recording ? "bg-primary animate-pulse" : busy ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} /><span>{status}</span></div></div><div className="space-y-3 p-4 sm:p-5">{messages.slice(-12).map((m) => <div key={m.id} className={`rounded-2xl px-3 py-2.5 text-sm ${m.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-secondary/60"}`}><div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{m.role === "user" ? "You" : "Buddy"}</div><p className="whitespace-pre-wrap leading-5">{m.content}</p></div>)}{transcript && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">You said: {transcript}</div>}{attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((f, i) => <button key={`${f.name}-${i}`} type="button" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} className="rounded-full border border-border px-3 py-1 text-[10px]">{f.name} ×</button>)}</div>}<div className="flex items-end gap-2 rounded-2xl border border-border bg-background/60 p-2"><label className="cursor-pointer rounded-xl p-2 hover:bg-secondary" aria-label="Attach files"><Paperclip className="size-5" /><input type="file" multiple accept="image/*,audio/*,video/*,.txt,.pdf" className="sr-only" onChange={(e) => setAttachments((x) => [...x, ...Array.from(e.target.files || [])].slice(-6))} /></label><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void answer(input); } }} placeholder="Talk to Buddy…" rows={1} className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" /><button type="button" onClick={() => void answer(input)} disabled={!input.trim() || busy} className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-40" aria-label="Send"><Send className="size-5" /></button></div></div></section>);
}
