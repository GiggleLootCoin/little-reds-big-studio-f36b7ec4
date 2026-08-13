import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Paperclip, Phone, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { setBuddyStatus } from "@/lib/buddy-presence";
import {
  listMicrophones,
  requestMicrophone,
  stopMicrophone,
  describeMicrophoneError,
  type MicrophoneInfo,
} from "@/lib/microphone";
import { BuddyVoicePicker } from "./BuddyVoicePicker";
import { getBuddyVoiceProfile } from "@/lib/buddy-voice";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import "./BuddyVisual.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: { id: string; name: string; type: string; size: number }[];
};
const KEY = "lrbgs-buddy-chat-v3";
export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(false),
    [recording, setRecording] = useState(false),
    [muted, setMuted] = useState(false),
    [status, setStatus] = useState("Buddy is ready."),
    [attachments, setAttachments] = useState<File[]>([]),
    [mics, setMics] = useState<MicrophoneInfo[]>([]),
    [micId, setMicId] = useState(""),
    [micPermission, setMicPermission] = useState("unknown"),
    [transcript, setTranscript] = useState("");
  const stream = useRef<MediaStream | null>(null),
    rec = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]),
    audio = useRef<HTMLAudioElement | null>(null),
    liveRef = useRef(false),
    busyRef = useRef(false),
    speakingRef = useRef(false),
    restartTimer = useRef<number | null>(null),
    silenceTimer = useRef<number | null>(null),
    ctx = useRef<AudioContext | null>(null),
    raf = useRef<number | null>(null),
    speech = useRef(false);
  useEffect(() => {
    try {
      const x = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(x)) setMessages(x.slice(-50));
    } catch {}
    void refreshMics();
    void permission();
    return () => stopAll();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages]);
  async function permission() {
    try {
      const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (p) {
        const f = () => setMicPermission(p.state);
        f();
        p.onchange = f;
      }
    } catch {}
  }
  async function refreshMics() {
    try {
      setMics(await listMicrophones());
    } catch {
      setMics([]);
    }
  }
  async function openMic() {
    try {
      setStatus("Opening your phone microphone… Chrome may ask you to Allow microphone access.");
      const s = await requestMicrophone(micId && micId !== "default" ? micId : undefined);
      if (s.getAudioTracks()[0]?.readyState !== "live")
        throw Error("No live microphone stream was provided.");
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
  function stopMonitor() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    try {
      ctx.current?.close();
    } catch {}
    ctx.current = null;
  }
  function monitor(s: MediaStream) {
    try {
      const c = new AudioContext();
      ctx.current = c;
      const a = c.createAnalyser(),
        src = c.createMediaStreamSource(s);
      a.fftSize = 2048;
      src.connect(a);
      const d = new Uint8Array(a.fftSize);
      const tick = () => {
        if (!liveRef.current || rec.current?.state !== "recording") return;
        a.getByteTimeDomainData(d);
        let sum = 0;
        for (const v of d) {
          const n = (v - 128) / 128;
          sum += n * n;
        }
        const rms = Math.sqrt(sum / d.length);
        if (rms > 0.018) {
          speech.current = true;
          if (silenceTimer.current) clearTimeout(silenceTimer.current);
          silenceTimer.current = null;
        } else if (speech.current && !silenceTimer.current) {
          silenceTimer.current = window.setTimeout(() => {
            silenceTimer.current = null;
            if (rec.current?.state === "recording") rec.current.stop();
          }, 1400);
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      setStatus("Live microphone is active. Tap End Buddy when you finish speaking.");
    }
  }
  function schedule(delay = 250) {
    if (!liveRef.current) return;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = window.setTimeout(() => {
      restartTimer.current = null;
      if (liveRef.current && !busyRef.current && !speakingRef.current && !rec.current)
        void beginLive();
    }, delay);
  }
  async function stt(blob: Blob) {
    if (!blob.size) throw Error("I didn't catch any audio. Try again.");
    setStatus("Transcribing what you said…");
    const r = await runStudioJob("speech-to-text", { audio: blob }, setStatus),
      t = artifactText(r.value).trim();
    if (!t) throw Error("I couldn't understand that. Try again.");
    return t;
  }
  function start(s: MediaStream, isLive: boolean) {
    if (typeof MediaRecorder === "undefined")
      throw Error("This browser cannot capture microphone audio.");
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((x) =>
      MediaRecorder.isTypeSupported(x),
    );
    const r = type ? new MediaRecorder(s, { mimeType: type }) : new MediaRecorder(s);
    chunks.current = [];
    speech.current = false;
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    r.onstop = () => {
      stopMonitor();
      const b = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
      chunks.current = [];
      rec.current = null;
      setRecording(false);
      if (!b.size) return;
      void stt(b)
        .then((t) => {
          setTranscript(t);
          return answer(t, true);
        })
        .catch((e) => {
          setStatus(e instanceof Error ? e.message : "Speech recognition failed.");
          schedule(500);
        });
    };
    rec.current = r;
    r.start(250);
    setRecording(true);
    setBuddyStatus("listening", { message: "Buddy is listening…" });
    setStatus(
      isLive
        ? "Listening… pause naturally or tap End Buddy."
        : "Recording… tap Stop & Send when you're finished.",
    );
    if (isLive) monitor(s);
  }
  async function beginLive() {
    if (!liveRef.current || busyRef.current || speakingRef.current || rec.current) return;
    const s = stream.current?.active ? stream.current : await openMic();
    if (s)
      try {
        start(s, true);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Microphone capture failed.");
      }
  }
  async function toggleLive() {
    if (liveRef.current) {
      liveRef.current = false;
      setLive(false);
      try {
        rec.current?.stop();
      } catch {}
      stopMonitor();
      stopMicrophone(stream.current);
      stream.current = null;
      setRecording(false);
      setBuddyStatus("idle");
      setStatus("Buddy call ended.");
      return;
    }
    liveRef.current = true;
    setLive(true);
    await beginLive();
  }
  async function recordOnce() {
    if (busyRef.current || liveRef.current) return;
    if (recording) {
      try {
        rec.current?.stop();
      } catch {}
      stopMonitor();
      return;
    }
    const s = await openMic();
    if (s)
      try {
        start(s, false);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Microphone capture failed.");
      }
  }
  async function answer(text: string, spoken = false) {
    const clean = text.trim();
    if (!clean || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatus("Buddy is thinking…");
    const u: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: clean,
      createdAt: Date.now(),
      attachments: attachments.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        type: f.type,
        size: f.size,
      })),
    };
    setMessages((x) => [...x, u]);
    setInput("");
    try {
      const history = [...messages, u]
        .slice(-24)
        .map((m) => ({ role: m.role, content: m.content }));
      const r = await runStudioJob(
          "chat",
          { prompt: clean, text: clean, messages: history, history },
          setStatus,
        ),
        reply = artifactText(r.value).trim();
      if (!reply) throw Error("Buddy did not return a response.");
      setMessages((x) => [
        ...x,
        { id: crypto.randomUUID(), role: "assistant", content: reply, createdAt: Date.now() },
      ]);
      setStatus("Buddy responded.");
      if (spoken || liveRef.current) await speak(reply);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Buddy could not respond right now.");
      setMessages((x) => [
        ...x,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I couldn't complete that response. Please try again.",
          createdAt: Date.now(),
        },
      ]);
    } finally {
      busyRef.current = false;
      setBusy(false);
      schedule(250);
    }
  }
  async function speak(text: string) {
    if (muted || speakingRef.current) return;
    speakingRef.current = true;
    setBuddyStatus("working", { message: "Buddy is speaking…" });
    try {
      const v = getBuddyVoiceProfile(),
        i: Record<string, unknown> = {
          text,
          target_text: text,
          language: v.language,
          speaker: v.speaker,
        };
      if (v.mode === "clone" && v.referenceDataUrl)
        i.referenceAudio = await (await fetch(v.referenceDataUrl)).blob();
      const r = await runStudioJob("tts", i, setStatus);
      if (!r.url) throw Error("No usable voice was returned.");
      const a = audio.current ?? new Audio();
      audio.current = a;
      a.src = r.url;
      await new Promise<void>((ok, no) => {
        a.onended = () => ok();
        a.onerror = () => no(Error("Audio playback failed"));
        void a.play().catch(no);
      });
    } catch {
      if ("speechSynthesis" in window)
        await new Promise<void>((ok) => {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = navigator.language || "en-US";
          u.rate = 0.98;
          u.onend = () => ok();
          u.onerror = () => ok();
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
        });
    } finally {
      speakingRef.current = false;
      setBuddyStatus("idle");
      schedule(250);
    }
  }
  function stopAll() {
    liveRef.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    stopMonitor();
    try {
      rec.current?.stop();
    } catch {}
    rec.current = null;
    stopMicrophone(stream.current);
    stream.current = null;
    try {
      audio.current?.pause();
    } catch {}
  }
  return (
    <section className="glass-panel overflow-hidden rounded-3xl border border-primary/25 shadow-[0_18px_60px_oklch(0_0_0_/_0.22)]">
      <div className="bg-gradient-to-r from-primary/15 via-background/60 to-primary/5 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <img
            src={buddyReference}
            alt="Buddy"
            className="size-14 rounded-2xl border border-primary/30 object-cover shadow-lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="font-display text-lg font-bold">Buddy</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Set Buddy up once, then talk, type, attach, and switch modes whenever you want.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            className="rounded-xl border border-border p-2"
            aria-label={muted ? "Unmute Buddy" : "Mute Buddy"}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <BuddyVoicePicker />
          <div className="rounded-2xl border border-primary/20 bg-background/50 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em]">
              2. Enable your microphone
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Tap the button below. Chrome must receive this user action before it can show its
              microphone permission prompt.
            </p>
            {micPermission !== "granted" && (
              <button
                type="button"
                onClick={() =>
                  void openMic().then((s) => {
                    if (s) {
                      stopMicrophone(s);
                      stream.current = null;
                      setStatus("Microphone ready. Buddy is ready to listen.");
                    }
                  })
                }
                className="mt-2 w-full rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground"
              >
                {micPermission === "denied" ? "Open microphone access again" : "Enable microphone"}
              </button>
            )}
            {micPermission === "granted" && (
              <p className="mt-2 text-xs font-semibold text-green-500">Microphone ready.</p>
            )}
            {micPermission === "denied" && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                If Chrome has already blocked this site, open Chrome → site settings → Microphone →
                Allow, then return here and tap the button again.
              </p>
            )}
            {mics.length > 1 && (
              <label className="mt-3 block text-[10px] text-muted-foreground">
                Microphone
                <select
                  value={micId}
                  onChange={(e) => setMicId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs"
                >
                  <option value="">Phone default</option>
                  {mics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void toggleLive()}
            disabled={busy && !live}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-lg sm:flex-none ${live ? "bg-destructive text-destructive-foreground" : "crimson-gloss text-primary-foreground"}`}
          >
            <Phone className="size-4" />
            {live ? "End Buddy" : "Live Buddy"}
          </button>
          <button
            type="button"
            onClick={() => void recordOnce()}
            disabled={busy || live}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold sm:flex-none ${recording ? "border-primary bg-primary/10" : "border-border bg-background/70"}`}
          >
            {recording ? <MicOff className="size-4 text-primary" /> : <Mic className="size-4" />}
            {recording ? "Stop & Send" : "Tap to Talk"}
          </button>
        </div>
        <div
          className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"
          aria-live="polite"
        >
          <span
            className={`size-2 rounded-full ${recording ? "bg-primary animate-pulse" : busy ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`}
          />
          <span>{status}</span>
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {messages.slice(-12).map((m) => (
          <div
            key={m.id}
            className={`rounded-2xl px-3 py-2.5 text-sm ${m.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-secondary/60"}`}
          >
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
              {m.role === "user" ? "You" : "Buddy"}
            </div>
            <p className="whitespace-pre-wrap leading-5">{m.content}</p>
          </div>
        ))}
        {transcript && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
            You said: {transcript}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((f, i) => (
              <button
                key={`${f.name}-${i}`}
                type="button"
                onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}
                className="rounded-full border border-border px-3 py-1 text-[10px]"
              >
                {f.name} ×
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background/60 p-2">
          <label
            className="cursor-pointer rounded-xl p-2 hover:bg-secondary"
            aria-label="Attach files"
          >
            <Paperclip className="size-5" />
            <input
              type="file"
              multiple
              accept="image/*,audio/*,video/*,.txt,.pdf"
              className="sr-only"
              onChange={(e) =>
                setAttachments((x) => [...x, ...Array.from(e.target.files || [])].slice(-6))
              }
            />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void answer(input);
              }
            }}
            placeholder="Talk to Buddy…"
            rows={1}
            className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void answer(input)}
            disabled={!input.trim() || busy}
            className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="size-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
