import { useEffect, useRef, useState } from "react";
import {
  Brain,
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { setBuddyStatus } from "@/lib/buddy-presence";
import {
  chooseMicrophone,
  describeMicrophoneError,
  listMicrophones,
  requestMicrophone,
  stopMicrophone,
  type MicrophoneInfo,
} from "@/lib/microphone";
import { Panel, StudioButton } from "./ui";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";

type Message = { role: "user" | "assistant"; content: string };
type CaptureMode = "idle" | "live" | "record";
const KEY = "lrbgs-buddy-chat";

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
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
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const monitorRef = useRef<number | null>(null);
  const modeRef = useRef<CaptureMode>("idle");
  const liveRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const startedAtRef = useRef(0);
  const heardSpeechRef = useRef(false);
  const silenceSinceRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Message[];
      if (Array.isArray(saved)) setMessages(saved.slice(-30));
    } catch {
      /* ignore corrupt local history */
    }
    void refreshMicrophones();
    const onDeviceChange = () => void refreshMicrophones();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      stopAll();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage can be unavailable in private browsing */
    }
  }, [messages]);

  async function refreshMicrophones() {
    try {
      const devices = await listMicrophones();
      setMicOptions(devices);
      if (!micId) setMicId(chooseMicrophone(devices)?.id || "");
    } catch {
      setMicOptions([]);
    }
  }

  async function openMicrophone() {
    try {
      let stream = await requestMicrophone();
      const devices = await listMicrophones();
      setMicOptions(devices);
      const preferred = devices.find((device) => device.id === micId) ?? chooseMicrophone(devices);
      if (preferred && preferred.id !== "default") {
        stopMicrophone(stream);
        try {
          stream = await requestMicrophone(preferred.id);
          setMicId(preferred.id);
        } catch {
          /* Keep the already-authorized working default input. */
        }
      }
      streamRef.current = stream;
      return stream;
    } catch (error) {
      setStatus(describeMicrophoneError(error));
      setBuddyStatus("error", { message: describeMicrophoneError(error) });
      return null;
    }
  }

  function cleanupCapture() {
    if (monitorRef.current !== null) window.clearInterval(monitorRef.current);
    monitorRef.current = null;
    try {
      audioContextRef.current?.close();
    } catch {
      /* ignore */
    }
    audioContextRef.current = null;
    stopMicrophone(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }

  function stopRecorderWithoutProcessing() {
    modeRef.current = "idle";
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    cleanupCapture();
  }

  async function processAudio(blob: Blob, mode: CaptureMode) {
    if (!blob.size) {
      setStatus("I didn't catch any audio. Try again.");
      return;
    }
    try {
      setBuddyStatus("thinking", { message: "Buddy is understanding you…" });
      setStatus("Buddy is understanding you…");
      const stt = await runStudioJob("speech-to-text", { audio: blob }, setStatus);
      const text = artifactText(stt.value).trim();
      if (!text) throw new Error("I didn't catch that. Try again.");
      if (mode === "record") {
        setTranscript(text);
        setStatus("Transcription ready. Edit it or send it to Buddy.");
      } else if (mode === "live") {
        await answer(text, true);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Speech recognition failed.");
      setBuddyStatus("error", { message: "Speech recognition failed." });
    }
  }

  function monitorSpeech(stream: MediaStream, recorder: MediaRecorder, mode: CaptureMode) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    audioContextRef.current = context;
    const data = new Uint8Array(analyser.fftSize);
    startedAtRef.current = Date.now();
    heardSpeechRef.current = false;
    silenceSinceRef.current = null;
    monitorRef.current = window.setInterval(() => {
      if (recorderRef.current !== recorder || recorder.state !== "recording") return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = Date.now();
      if (rms > 0.035) {
        heardSpeechRef.current = true;
        silenceSinceRef.current = null;
      } else if (heardSpeechRef.current) {
        silenceSinceRef.current ??= now;
      }
      const elapsed = now - startedAtRef.current;
      const silentFor = silenceSinceRef.current ? now - silenceSinceRef.current : 0;
      if ((heardSpeechRef.current && elapsed > 700 && silentFor > 1200) || elapsed > 12000) {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
    }, 120);
    if (mode === "record") {
      window.setTimeout(() => {
        if (recorderRef.current === recorder && recorder.state === "recording") recorder.stop();
      }, 30000);
    }
  }

  async function beginCapture(mode: CaptureMode) {
    if (busyRef.current || recording || speakingRef.current) return;
    const stream = await openMicrophone();
    if (!stream || typeof MediaRecorder === "undefined") {
      setStatus("This browser cannot record microphone audio.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    modeRef.current = mode;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      cleanupCapture();
      const captureMode = modeRef.current;
      modeRef.current = "idle";
      if (captureMode !== "idle") void processAudio(blob, captureMode);
    };
    recorderRef.current = recorder;
    recorder.start(200);
    setRecording(true);
    setBuddyStatus("listening", {
      message: mode === "live" ? "Buddy is listening…" : "Recording your voice…",
    });
    setStatus(
      mode === "live"
        ? "Listening… speak naturally, then pause."
        : "Recording… tap stop when you're done.",
    );
    monitorSpeech(stream, recorder, mode);
  }

  function stopCapture() {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
  }

  async function speak(text: string) {
    if (muted || speakingRef.current) return;
    speakingRef.current = true;
    setBuddyStatus("working", { message: "Buddy is speaking…" });
    try {
      const result = await runStudioJob(
        "tts",
        { text, target_text: text, language: "English" },
        setStatus,
      );
      if (!result.url) throw new Error("No verified voice artifact returned.");
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = result.url;
      audioRef.current.onended = () => {
        speakingRef.current = false;
        if (liveRef.current) void beginCapture("live");
        else setBuddyStatus("idle");
      };
      audioRef.current.onerror = () => {
        speakingRef.current = false;
        setBuddyStatus("error", { message: "Buddy's voice could not be played." });
      };
      await audioRef.current.play();
    } catch {
      try {
        if ("speechSynthesis" in window) {
          await new Promise<void>((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.98;
            utterance.pitch = 1.02;
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
          });
        }
      } finally {
        speakingRef.current = false;
        if (liveRef.current) void beginCapture("live");
        else setBuddyStatus("idle");
      }
    }
  }

  async function answer(text: string, speakReply = false) {
    const clean = text.trim();
    if (!clean || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setBuddyStatus("thinking", { message: "Buddy is thinking…" });
    const next = [...messages, { role: "user" as const, content: clean }].slice(-16);
    setMessages(next);
    setInput("");
    try {
      const prompt = [
        {
          role: "system" as const,
          content:
            "You are Buddy from Little Red's Big Studio: a sharp, warm, funny creative partner for music and YouTube. Never claim an action happened unless the Studio returned a verified result. Be concise and useful.",
        },
        ...next,
      ];
      const result = await runStudioJob(
        "chat",
        { prompt, text: clean, messages: prompt },
        setStatus,
      );
      const reply = artifactText(result.value)
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      if (!reply) throw new Error("Buddy returned no usable response.");
      setMessages([...next, { role: "assistant", content: reply }]);
      setStatus("Buddy is ready.");
      setBuddyStatus("success", { message: "Buddy is ready." });
      if (speakReply || liveRef.current) void speak(reply);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Buddy's free routes are temporarily unavailable.",
      );
      setBuddyStatus("error", { message: "Buddy could not complete that response." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function stopAll() {
    liveRef.current = false;
    modeRef.current = "idle";
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    cleanupCapture();
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setBuddyStatus("idle");
  }

  async function toggleLive() {
    if (liveRef.current) {
      stopAll();
      setLive(false);
      setStatus("Call ended. Buddy is ready.");
      return;
    }
    liveRef.current = true;
    setLive(true);
    setStatus("Connecting to Buddy…");
    const stream = await openMicrophone();
    if (!stream) {
      liveRef.current = false;
      setLive(false);
      return;
    }
    await beginCapture("live");
  }

  return (
    <Panel
      eyebrow="BUDDY • LIVE"
      title="Call Buddy"
      icon={<Sparkles className="size-5" />}
      defaultOpen
    >
      <div className="relative overflow-hidden rounded-[1.6rem] border border-primary/30 bg-[radial-gradient(circle_at_50%_25%,oklch(0.34_0.12_25_/_0.65),transparent_48%),linear-gradient(145deg,oklch(0.08_0.02_20),oklch(0.14_0.04_20))] p-5 shadow-[0_24px_70px_oklch(0_0_0_/_0.45)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 size-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col items-center text-center">
          <div
            className={`relative size-32 rounded-full border border-primary/35 bg-black/35 p-2 shadow-[0_0_50px_oklch(0.58_0.24_26_/_0.25)] sm:size-40 ${live ? "animate-pulse-glow" : ""}`}
          >
            <div className="buddy-aura absolute inset-3 rounded-full bg-primary/25 blur-xl" />
            <img
              src={buddyReference}
              alt="Buddy"
              className="buddy-character-image relative h-full w-full object-contain"
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            <span
              className={`size-2 rounded-full ${live ? "animate-pulse bg-primary" : "bg-muted-foreground/50"}`}
            />
            {live ? (recording ? "Listening" : busy ? "Thinking" : "Connected") : "Ready"}
          </div>
          <h3 className="mt-2 font-display text-xl font-black sm:text-2xl">
            {live ? "Buddy is with you" : "Talk naturally with Buddy"}
          </h3>
          <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
            One tap to start. Speak, pause, and Buddy answers with voice, then listens again.
          </p>
          <div className="mt-5 flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <StudioButton
              className="min-h-12 flex-1"
              onClick={() => void toggleLive()}
              aria-pressed={live}
            >
              {live ? <Phone className="size-4" /> : <Phone className="size-4" />}
              {live ? "End Buddy Call" : "Call Buddy"}
            </StudioButton>
            <button
              type="button"
              onClick={() => {
                setMuted((value) => !value);
                window.speechSynthesis?.cancel();
              }}
              className="min-h-12 rounded-xl border border-border bg-background/50 px-4 text-xs font-semibold"
            >
              {muted ? (
                <VolumeX className="mr-2 inline size-4" />
              ) : (
                <Volume2 className="mr-2 inline size-4" />
              )}
              {muted ? "Voice muted" : "Voice on"}
            </button>
          </div>
        </div>
      </div>

      {micOptions.length > 1 && (
        <label className="mt-3 block rounded-xl border border-border bg-background/50 p-3 text-xs">
          <span className="mb-1 block font-semibold">Microphone</span>
          <select
            value={micId}
            onChange={(event) => setMicId(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          >
            {micOptions.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div
        className="mt-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {busy ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
        ) : live ? (
          <Mic className="size-4 shrink-0 text-primary" />
        ) : (
          <Brain className="size-4 shrink-0 text-primary" />
        )}
        <span>{status}</span>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || live}
          onClick={() => void beginCapture("record")}
          className="min-h-11 rounded-xl border border-border bg-background/50 px-3 text-xs font-semibold disabled:opacity-45"
        >
          <Mic className="mr-2 inline size-4 text-primary" /> Record → Text
        </button>
        {recording && !live && (
          <button
            type="button"
            onClick={stopCapture}
            className="min-h-11 rounded-xl border border-primary/40 bg-primary/10 px-3 text-xs font-semibold"
          >
            <MicOff className="mr-2 inline size-4" /> Stop recording
          </button>
        )}
      </div>

      {transcript && (
        <div className="mt-3 rounded-xl border border-border bg-background/40 p-3">
          <label className="text-xs font-semibold">Transcription</label>
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-border bg-background/60 p-3 text-sm"
          />
          <StudioButton
            className="mt-2"
            disabled={busy || !transcript.trim()}
            onClick={() => void answer(transcript, true)}
          >
            <Send className="size-4" /> Send to Buddy
          </StudioButton>
        </div>
      )}

      <div
        className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background/35 p-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">“Alright. What are we making?”</p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "ml-auto crimson-gloss text-primary-foreground" : "border border-border bg-background/60"}`}
            >
              {message.content}
            </div>
          ))
        )}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void answer(input, false);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          placeholder="Type to Buddy…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <StudioButton type="submit" disabled={busy || !input.trim()} aria-label="Send message">
          <Send className="size-4" />
        </StudioButton>
      </form>
      <p className="mt-2 text-[0.65rem] leading-4 text-muted-foreground">
        Buddy first requests permission, discovers available inputs, prefers a working non-default
        microphone, and falls back to the device default when necessary. A browser or OS denial
        cannot be bypassed.
      </p>
    </Panel>
  );
}
