import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, MicOff, Paperclip, Phone, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { setBuddyStatus } from "@/lib/buddy-presence";
import { acceptBuddyFile, attachmentSummary, buddyAccept, fileToDataUrl, revokeBuddyAttachment, type BuddyAttachment } from "@/lib/buddy-attachments";
import { listMicrophones, requestMicrophone, stopMicrophone, describeMicrophoneError, type MicrophoneInfo } from "@/lib/microphone";
import { Panel, StudioButton } from "./ui";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import "./BuddyVisual.css";

type Mode = "idle" | "live" | "record";
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: number; attachments?: Array<{ id: string; name: string; type: string; size: number; url?: string }> };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void; abort: () => void;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; } & { isFinal?: boolean }>> }) => void) | null;
};
const KEY = "lrbgs-buddy-chat-v2";
const recognitionCtor = () => (window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as Window & { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<BuddyAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Buddy is ready.");
  const [micOptions, setMicOptions] = useState<MicrophoneInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [transcript, setTranscript] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<Mode>("idle");
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const recognitionTextRef = useRef("");
  const recognitionRestartRef = useRef(false);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Message[]; if (Array.isArray(saved)) setMessages(saved.slice(-50)); }
    catch { localStorage.removeItem(KEY); }
    void refreshMicrophones();
    const onDeviceChange = () => void refreshMicrophones();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => { navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange); stopAll(); attachments.forEach(revokeBuddyAttachment); };
    // Mount-only lifecycle intentionally owns capture resources through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-50).map(({ attachments: savedAttachments, ...message }) => ({ ...message, attachments: savedAttachments?.map(({ url: _url, ...metadata }) => metadata) })))); } catch {}
  }, [messages]);

  async function refreshMicrophones() { try { setMicOptions(await listMicrophones()); } catch { setMicOptions([]); } }

  function stopRecognition() {
    recognitionRestartRef.current = false;
    const recognition = recognitionRef.current; recognitionRef.current = null;
    if (recognition) { try { recognition.onend = null; recognition.abort(); } catch {} }
  }

  async function openMicrophone() {
    try {
      const stream = await requestMicrophone(micId && micId !== "default" ? micId : undefined);
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") { stopMicrophone(stream); throw new Error("Android did not provide a live microphone stream."); }
      streamRef.current = stream;
      await refreshMicrophones();
      return stream;
    } catch (error) {
      const message = describeMicrophoneError(error);
      setStatus(message); setBuddyStatus("error", { message }); return null;
    }
  }

  async function transcribeBlob(blob: Blob) {
    if (!blob.size) throw new Error("I didn't catch any audio. Try again.");
    const result = await runStudioJob("speech-to-text", { audio: blob }, setStatus);
    const text = artifactText(result.value).trim();
    if (!text) throw new Error("Speech recognition returned no usable text.");
    return text;
  }

  function startMediaRecorder(mode: Mode, stream: MediaStream) {
    if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record microphone audio.");
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = []; modeRef.current = mode;
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }); chunksRef.current = []; recorderRef.current = null;
      const captureMode = modeRef.current; modeRef.current = "idle"; setRecording(false);
      if (captureMode === "record") { stopMicrophone(streamRef.current); streamRef.current = null; if (!blob.size) return; void transcribeBlob(blob).then(setTranscript).then(() => setStatus("Transcription ready. Edit it or send it to Buddy.")).catch((error) => setStatus(error instanceof Error ? error.message : "Speech recognition failed.")); }
      else if (captureMode === "live" && liveRef.current && blob.size) { void transcribeBlob(blob).then((text) => answer(text, true)).catch((error) => setStatus(error instanceof Error ? error.message : "Speech recognition failed.")); }
      else { stopMicrophone(streamRef.current); streamRef.current = null; }
    };
    recorderRef.current = recorder; recorder.start(250); setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" });
    setStatus(mode === "live" ? "Listening… speak naturally, then pause." : "Recording… tap stop when you're done.");
  }

  function startBrowserRecognition(mode: Mode) {
    const Ctor = recognitionCtor(); if (!Ctor) return false;
    const recognition = new Ctor(); recognition.continuous = mode === "live"; recognition.interimResults = true; recognition.lang = localStorage.getItem("buddy-language") || navigator.language || "en-US";
    recognitionTextRef.current = ""; modeRef.current = mode; recognitionRestartRef.current = mode === "live"; recognitionRef.current = recognition;
    recognition.onstart = () => { setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" }); setStatus("Listening…"); };
    recognition.onresult = (event) => {
      let finalText = ""; let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) { const result = event.results[i]; const text = result[0]?.transcript || ""; if (result.isFinal) finalText += `${text} `; else interimText += `${text} `; }
      if (finalText.trim()) recognitionTextRef.current = `${recognitionTextRef.current} ${finalText}`.trim();
      if (mode === "record") setTranscript(`${recognitionTextRef.current}${interimText ? ` ${interimText}` : ""}`.trim());
    };
    recognition.onerror = (event) => {
      const error = event.error || "unknown";
      if (error === "not-allowed" || error === "service-not-allowed") { recognitionRestartRef.current = false; setStatus("Microphone permission was denied. Allow microphone access for this site, then tap Call Buddy again."); }
      else if (error !== "aborted" && !speakingRef.current) setStatus("Browser speech recognition is unavailable; Buddy will use the Studio speech engine if recording is available.");
    };
    recognition.onend = () => {
      const text = recognitionTextRef.current.trim(); recognitionRef.current = null; setRecording(false);
      if (text) { recognitionTextRef.current = ""; if (mode === "record") { setTranscript(text); setStatus("Transcription ready. Edit it or send it to Buddy."); } else if (liveRef.current) void answer(text, true); }
      if (liveRef.current && mode === "live" && recognitionRestartRef.current && !speakingRef.current && !busyRef.current) setTimeout(() => { if (liveRef.current && !speakingRef.current) void beginCapture("live"); }, 250);
      else if (!liveRef.current && mode !== "record") setStatus(text ? "Buddy received you." : "I didn't catch that. Try again.");
    };
    try { recognition.start(); return true; } catch { recognitionRef.current = null; return false; }
  }

  async function beginCapture(mode: Mode) {
    if (busyRef.current || speakingRef.current || recording) return;
    // Always open the real Android microphone first. This is intentionally done from
    // the Call/Record user action so the browser receives a trusted permission signal.
    const stream = streamRef.current?.active ? streamRef.current : await openMicrophone();
    if (!stream) return;
    if (mode === "live") {
      if (startBrowserRecognition("live")) return;
      // Last-resort fallback: capture a short complete media container, transcribe it,
      // then immediately start another segment. This keeps live mode functional even
      // when Web Speech is unavailable.
      startMediaRecorder("live", stream);
      window.setTimeout(() => { if (liveRef.current && recorderRef.current?.state === "recording") { try { recorderRef.current.stop(); } catch {} } }, 6500);
      return;
    }
    if (mode === "record") { if (startBrowserRecognition("record")) return; startMediaRecorder("record", stream); return; }
  }

  function stopCapture() { stopRecognition(); try { recorderRef.current?.stop(); } catch {} setRecording(false); }

  async function speak(text: string) {
    if (muted || speakingRef.current) return;
    stopRecognition();
    speakingRef.current = true; setBuddyStatus("working", { message: "Buddy is speaking…" });
    try {
      const result = await runStudioJob("tts", { text, target_text: text }, setStatus); if (!result.url) throw new Error("No voice artifact returned.");
      if (!audioRef.current) audioRef.current = new Audio(); const audio = audioRef.current; audio.src = result.url;
      audio.onended = () => { speakingRef.current = false; setBuddyStatus("idle"); if (liveRef.current) setTimeout(() => void beginCapture("live"), 200); };
      audio.onerror = () => { speakingRef.current = false; };
      await audio.play(); setStatus("Buddy is speaking…");
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.resume();
        await new Promise<void>((resolve) => { const utterance = new SpeechSynthesisUtterance(text); utterance.lang = localStorage.getItem("buddy-language") || navigator.language || "en-US"; utterance.rate = 0.98; utterance.pitch = 1.02; utterance.onend = () => resolve(); utterance.onerror = () => resolve(); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); });
      }
      speakingRef.current = false; if (liveRef.current) setTimeout(() => void beginCapture("live"), 200); else setBuddyStatus("idle");
    }
  }

  async function answer(text: string, speakReply = false) {
    const clean = text.trim(); if ((!clean && !attachments.length) || busyRef.current) return;
    busyRef.current = true; setBusy(true); setBuddyStatus("thinking", { message: "Buddy is thinking…" });
    const currentAttachments = [...attachments]; setAttachments([]);
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: clean || "Please look at the attached files.", createdAt: Date.now(), attachments: currentAttachments.map(({ file: _file, url, ...metadata }) => ({ ...metadata, url })) };
    const next = [...messages, userMessage].slice(-30); setMessages(next); setInput("");
    try {
      const imageParts = await Promise.all(currentAttachments.filter((a) => a.type.startsWith("image/")).slice(0, 4).map(async (a) => ({ type: "image_url" as const, image_url: { url: await fileToDataUrl(a.file) } })));
      const attachmentText = currentAttachments.length ? `\nAttachments: ${currentAttachments.map(attachmentSummary).join(", ")}` : "";
      const prompt: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [{ role: "system", content: "You are Buddy from Little Red's Big Studio, a warm, sharp creative partner for music and YouTube. Use the conversation context. Never claim a generation happened unless the Studio verified the artifact. If attachments are supplied, analyze them when possible." }, ...next.map((m) => ({ role: m.role, content: m.content }))];
      if (imageParts.length) prompt[prompt.length - 1].content = [{ type: "text", text: `${clean || "Analyze these attachments."}${attachmentText}` }, ...imageParts]; else if (attachmentText) prompt[prompt.length - 1].content = `${clean || "Analyze these attachments."}${attachmentText}`;
      const result = await runStudioJob("chat", { prompt, text: clean || "Analyze the attached files.", messages: prompt }, setStatus);
      const reply = artifactText(result.value).replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); if (!reply) throw new Error("Buddy returned no usable response.");
      setMessages((existing) => [...existing, { id: crypto.randomUUID(), role: "assistant" as const, content: reply, createdAt: Date.now() }].slice(-50)); setStatus("Buddy is ready."); setBuddyStatus("success", { message: "Buddy is ready." }); if (speakReply || liveRef.current) void speak(reply);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Buddy's free routes are temporarily unavailable."); setBuddyStatus("error", { message: "Buddy could not complete that response." }); }
    finally { currentAttachments.forEach(revokeBuddyAttachment); busyRef.current = false; setBusy(false); }
  }

  function stopAll() { liveRef.current = false; modeRef.current = "idle"; recognitionRestartRef.current = false; stopRecognition(); try { recorderRef.current?.stop(); } catch {} stopMicrophone(streamRef.current); streamRef.current = null; setRecording(false); audioRef.current?.pause(); window.speechSynthesis?.cancel(); speakingRef.current = false; setBuddyStatus("idle"); }

  async function toggleLive() {
    if (liveRef.current) { stopAll(); setLive(false); setStatus("Buddy call ended. Your conversation is still here."); return; }
    setLive(true); liveRef.current = true; setStatus("Requesting your phone microphone…"); window.speechSynthesis?.resume();
    const stream = await openMicrophone();
    if (!stream) { liveRef.current = false; setLive(false); return; }
    setStatus("Microphone ready. Connecting Buddy…");
    await beginCapture("live");
    if (!recognitionRef.current && !recorderRef.current) { liveRef.current = false; setLive(false); setStatus("Buddy could not start listening. Try Call Buddy again."); }
  }
  function sendTyped() { void answer(input, true); }
  function sendTranscript() { const text = transcript.trim(); if (text) { setTranscript(""); void answer(text, true); } }
  function addFiles(fileList: FileList | null) { if (!fileList) return; const added: BuddyAttachment[] = []; for (const file of Array.from(fileList)) { try { added.push(acceptBuddyFile(file)); } catch (error) { setStatus(error instanceof Error ? error.message : "Attachment could not be added."); } } setAttachments((existing) => [...existing, ...added].slice(0, 6)); }

  return (
    <Panel eyebrow="BUDDY • LIVE" title="Call Buddy" icon={<Sparkles className="size-5" />} defaultOpen>
      <div className="relative overflow-hidden rounded-[1.7rem] border border-primary/30 bg-[radial-gradient(circle_at_50%_15%,oklch(0.35_0.14_25_/_0.65),transparent_48%),linear-gradient(145deg,oklch(0.07_0.02_20),oklch(0.15_0.04_20))] p-5 shadow-[0_24px_70px_oklch(0_0_0_/_0.42)] sm:p-7">
        <div className="relative flex flex-col items-center text-center">
          <div className={`relative size-32 rounded-full border border-primary/35 bg-black/35 p-2 shadow-[0_0_50px_oklch(0.58_0.24_26_/_0.25)] sm:size-40 ${live ? "animate-pulse-glow" : ""}`}><div className="buddy-aura absolute inset-3 rounded-full bg-primary/25 blur-xl" /><img src={buddyReference} alt="Buddy" className="buddy-character-image relative h-full w-full object-contain" /></div>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary"><span className={`size-2 rounded-full ${live ? "animate-pulse bg-primary" : "bg-muted-foreground/50"}`} />{live ? (recording ? "Listening" : busy ? "Thinking" : "Connected") : "Ready"}</div>
          <h3 className="mt-2 font-display text-xl font-black sm:text-2xl">{live ? "Buddy is with you" : "Talk to Buddy"}</h3>
          <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{live ? "Speak naturally. Buddy answers, speaks, and listens again." : "Type, attach files, record a message, or start a hands-free conversation."}</p>
          <button type="button" onClick={() => void toggleLive()} className={`mt-5 flex min-h-12 items-center gap-2 rounded-full px-6 py-3 font-display text-sm font-black shadow-xl transition-transform active:scale-95 ${live ? "border border-primary/40 bg-background/70 text-foreground" : "crimson-gloss text-primary-foreground"}`}><Phone className="size-4" />{live ? "End Buddy Call" : "Call Buddy"}</button>
        </div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Microphone</span><Mic className="size-4 text-primary" /></div><select aria-label="Microphone" value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-2 w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"><option value="">Automatic phone microphone</option>{micOptions.map((mic) => <option key={mic.id} value={mic.id}>{mic.label}</option>)}</select></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Voice</span>{muted ? <VolumeX className="size-4 text-muted-foreground" /> : <Volume2 className="size-4 text-primary" />}</div><button type="button" onClick={() => setMuted((v) => !v)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold">{muted ? "Voice muted" : "Voice on"}</button></div>
        </div>
        {recording && <div className="mt-3 flex items-center justify-center gap-2 text-xs text-primary"><span className="size-2 animate-pulse rounded-full bg-primary" />{status}</div>}
        <div className="mt-5 rounded-2xl border border-border/60 bg-background/55 p-3">
          {attachments.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{attachments.map((a) => <div key={a.id} className="relative flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-2 py-2 text-xs">{a.type.startsWith("image/") ? <img src={a.url} alt={a.name} className="size-10 rounded-lg object-cover" /> : <span className="max-w-36 truncate">{a.name}</span>}<button type="button" aria-label={`Remove ${a.name}`} onClick={() => { revokeBuddyAttachment(a); setAttachments((items) => items.filter((item) => item.id !== a.id)); }}><X className="size-3.5" /></button></div>)}</div>}
          <div className="flex gap-2"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTyped(); } }} placeholder="Type to Buddy…" className="min-w-0 flex-1 rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm outline-none focus:border-primary" /><StudioButton onClick={sendTyped} disabled={busy || (!input.trim() && !attachments.length)}><Send className="size-4" /></StudioButton></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold"><Paperclip className="size-4" />Attach<input className="sr-only" type="file" multiple accept={buddyAccept} onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} /></label>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold"><ImagePlus className="size-4" />Photo<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} /></label>
            <StudioButton variant="ghost" onClick={() => void beginCapture("record")} disabled={recording || busy}><Mic className="size-4" />Record → Text</StudioButton>
            {recording && <StudioButton variant="ghost" onClick={stopCapture}><MicOff className="size-4" />Stop</StudioButton>}
            {transcript && <StudioButton variant="ghost" onClick={sendTranscript}><Send className="size-4" />Send transcript</StudioButton>}
          </div>
        </div>
        <div className="mt-4 max-h-72 space-y-2 overflow-auto pr-1">{messages.length === 0 ? <p className="py-5 text-center text-xs text-muted-foreground">Buddy is ready when you are.</p> : messages.map((message) => <div key={message.id} className={`rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-muted/60"}`}><div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{message.role === "user" ? "You" : "Buddy"}</div>{message.content}{message.attachments?.length ? <div className="mt-2 text-[10px] text-muted-foreground">{message.attachments.map((a) => a.name).join(" • ")}</div> : null}</div>)}</div>
        <div className="mt-3 text-center text-[10px] text-muted-foreground">{status}</div>
      </div>
    </Panel>
  );
}
