import { useEffect, useRef, useState } from "react";
import { Brain, LoaderCircle, Mic, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { Panel, StudioButton } from "./ui";

type Message = { role: "user" | "assistant"; content: string };
const KEY = "lrbgs-buddy-chat";
const MAX_STORED_MESSAGES = 200;

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Buddy is ready.");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const liveRef = useRef(false);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Message[];
      if (Array.isArray(saved)) setMessages(saved.slice(-MAX_STORED_MESSAGES));
    } catch {
      /* ignore corrupt browser cache */
    }
    return () => {
      liveRef.current = false;
      try {
        recorderRef.current?.stop();
      } catch {
        /* already stopped */
      }
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  }, [messages]);

  const restartListening = () => {
    if (!liveRef.current || busyRef.current || speakingRef.current || recorderRef.current) return;
    window.setTimeout(() => {
      if (!liveRef.current || busyRef.current || speakingRef.current || recorderRef.current) return;
      void startRecorder();
    }, 350);
  };

  const speak = async (text: string) => {
    if (muted || speakingRef.current) return;
    speakingRef.current = true;
    try {
      setStatus("Buddy is speaking…");
      const result = await runStudioJob(
        "tts",
        { text, target_text: text, language: "English" },
        setStatus,
      );
      if (!result.url) throw new Error("Buddy's natural voice route returned no playable audio.");

      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = result.url;
      await new Promise<void>((resolve, reject) => {
        const audio = audioRef.current!;
        const onEnded = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("Buddy's voice artifact could not be played."));
        };
        const cleanup = () => {
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
        };
        audio.addEventListener("ended", onEnded, { once: true });
        audio.addEventListener("error", onError, { once: true });
        void audio.play().catch((error) => {
          cleanup();
          reject(error);
        });
      });
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message} No robotic browser-voice fallback will be used.`
          : "Buddy's natural voice is temporarily unavailable. No robotic browser-voice fallback will be used.",
      );
    } finally {
      speakingRef.current = false;
      restartListening();
    }
  };

  const answer = async (text: string, speakReply = false) => {
    const clean = text.trim();
    if (!clean || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatus("Buddy is thinking…");
    const next = [...messages, { role: "user" as const, content: clean }];
    setMessages(next);
    setInput("");
    try {
      const context = next.slice(-32);
      const prompt = [
        {
          role: "system" as const,
          content:
            "You are Buddy from Little Red's Big Studio: a sharp, warm, funny creative partner for music and YouTube. Never claim an action happened unless the Studio actually returned a verified result. Be concise and useful.",
        },
        ...context,
      ];
      const result = await runStudioJob(
        "chat",
        { prompt, text: clean, messages: prompt },
        setStatus,
      );
      const reply =
        artifactText(result.value)
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim() || "I couldn't get a usable reply from the free routes just now.";
      setMessages([...next, { role: "assistant", content: reply }]);
      setStatus("Buddy is ready.");
      if (speakReply || liveRef.current) void speak(reply);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Buddy's free routes are temporarily unavailable.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (liveRef.current && !speakingRef.current) restartListening();
    }
  };

  const stopRecorder = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setListening(false);
  };

  const startRecorder = async () => {
    if (!liveRef.current || busyRef.current || speakingRef.current || recorderRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("This Android browser does not provide microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        recorderRef.current = null;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setListening(false);
        void (async () => {
          try {
            if (blob.size < 2048)
              throw new Error("I didn't get enough microphone audio. Try again.");
            setStatus("Buddy is understanding you…");
            const stt = await runStudioJob("speech-to-text", { audio: blob }, setStatus);
            const text = artifactText(stt.value);
            if (!text) throw new Error("I didn't catch that. Try again.");
            await answer(text, true);
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "Speech recognition failed.");
          } finally {
            restartListening();
          }
        })();
      };
      recorder.onerror = () => {
        recorderRef.current = null;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setListening(false);
        setStatus("The microphone capture failed. Buddy will try again.");
        restartListening();
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setListening(true);
      setStatus("Listening… pause when you're finished.");
      window.setTimeout(() => {
        if (recorderRef.current === recorder) recorder.stop();
      }, 10000);
    } catch {
      setListening(false);
      setStatus("Microphone permission is required for Live Conversation.");
    }
  };

  const stopAll = () => {
    liveRef.current = false;
    speakingRef.current = false;
    stopRecorder();
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setListening(false);
  };

  const toggleLive = () => {
    if (live) {
      stopAll();
      setLive(false);
      setStatus("Buddy is ready.");
    } else {
      liveRef.current = true;
      setLive(true);
      setStatus("Starting hands-free conversation…");
      void startRecorder();
    }
  };

  return (
    <Panel
      eyebrow="BUDDY • LIVE"
      title="Talk to Buddy"
      icon={<Sparkles className="size-5" />}
      defaultOpen
    >
      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Brain className="size-4 shrink-0 text-primary" />
        <span>{live ? (listening ? "Buddy is listening" : "Buddy is working") : status}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StudioButton onClick={toggleLive} aria-pressed={live}>
          <Mic className="size-4" />
          {live ? "Stop Hands-Free" : "Start Hands-Free"}
        </StudioButton>
        <button
          type="button"
          onClick={() => {
            setMuted((v) => !v);
            window.speechSynthesis?.cancel();
          }}
          className="rounded-xl border border-border px-3 py-2 text-xs"
        >
          {muted ? (
            <VolumeX className="mr-2 inline size-4" />
          ) : (
            <Volume2 className="mr-2 inline size-4" />
          )}
          {muted ? "Voice muted" : "Buddy voice on"}
        </button>
      </div>
      <div
        className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background/35 p-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">“Alright, Red. What are we making?”</p>
        ) : (
          messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto crimson-gloss text-primary-foreground" : "border border-border bg-background/60"}`}
            >
              {m.content}
            </div>
          ))
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Working…
          </div>
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void answer(input, true);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Talk or type to Buddy…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <StudioButton type="submit" disabled={busy || !input.trim()} aria-label="Send message">
          <Send className="size-4" />
        </StudioButton>
      </form>
      <p className="mt-2 text-[0.65rem] text-muted-foreground">
        Hands-free uses Android microphone capture, free speech recognition and Buddy's verified
        natural-voice routes. Browser speech is deliberately not used as a voice-quality fallback.
      </p>
    </Panel>
  );
}
