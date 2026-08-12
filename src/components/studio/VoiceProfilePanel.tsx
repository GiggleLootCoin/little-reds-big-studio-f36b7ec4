import { useEffect, useRef, useState } from "react";
import { Check, Mic2, Play, Trash2, Upload, Volume2 } from "lucide-react";
import { runStudioJob, type StudioArtifact } from "@/lib/studio-runtime";
import { requestMicrophone, stopMicrophone } from "@/lib/microphone";
import { clearVoiceSample, getVoiceSample, saveVoiceSample } from "@/lib/voice-profile";
import { Panel, StudioButton } from "./ui";

const VOICES = [
  ["Ryan", "Warm, natural, conversational"],
  ["Serena", "Clear, warm and expressive"],
  ["Vivian", "Bright and friendly"],
  ["Sohee", "Gentle and intimate"],
  ["Aiden", "Confident and relaxed"],
  ["Dylan", "Youthful and energetic"],
  ["Eric", "Calm and grounded"],
  ["Ono_anna", "Animated and lively"],
  ["Uncle_fu", "Deep and characterful"],
] as const;
const LANGUAGES = [
  "Auto",
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Danish",
  "Finnish",
  "Greek",
  "Swedish",
  "Norwegian",
  "Polish",
  "Russian",
  "Arabic",
  "Hebrew",
  "Hindi",
  "Chinese",
  "Cantonese",
  "Japanese",
  "Korean",
  "Malay",
  "Swahili",
  "Thai",
  "Turkish",
  "Vietnamese",
  "Tagalog",
  "Romanian",
  "Hungarian",
  "Persian (Farsi)",
  "Macedonian",
  "Czech",
];

export function VoiceProfilePanel() {
  const [voice, setVoice] = useState("Ryan");
  const [language, setLanguage] = useState("English");
  const [sample, setSample] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Choose a natural Buddy voice or use your own authorized voice sample.",
  );
  const [preview, setPreview] = useState<StudioArtifact | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setVoice(localStorage.getItem("buddy-voice-choice") || "Ryan");
    setLanguage(localStorage.getItem("buddy-language") || "English");
    void getVoiceSample().then(setSample);
  }, []);

  const chooseVoice = (value: string) => {
    setVoice(value);
    localStorage.setItem("buddy-voice-choice", value);
  };
  const chooseLanguage = (value: string) => {
    setLanguage(value);
    localStorage.setItem("buddy-language", value);
  };
  const saveSample = async (blob: Blob) => {
    await saveVoiceSample(blob);
    setSample(blob);
    setVoice("My voice");
    localStorage.setItem("buddy-voice-choice", "My voice");
    setStatus(
      "Your voice sample is saved on this device. Buddy can use it for authorized voice cloning.",
    );
  };

  const recordSample = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await requestMicrophone();
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        recorderRef.current = null;
        stopMicrophone(streamRef.current);
        streamRef.current = null;
        setRecording(false);
        if (blob.size) void saveSample(blob);
      };
      recorderRef.current = recorder;
      recorder.start(200);
      setRecording(true);
      setStatus("Recording your voice… speak naturally for a few seconds, then tap stop.");
      window.setTimeout(() => {
        if (recorderRef.current === recorder && recorder.state === "recording") recorder.stop();
      }, 15000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the microphone.");
    }
  };

  const previewVoice = async () => {
    if (busy) return;
    setBusy(true);
    setPreview(null);
    try {
      const text = "Hi, I’m Buddy from Little Red’s Big Studio. Let’s make something brilliant.";
      const result =
        voice === "My voice" && sample
          ? await runStudioJob(
              "voice-clone",
              { refAudio: sample, target_text: text, text, language, use_xvector_only: true },
              setStatus,
            )
          : await runStudioJob(
              "tts",
              { text, target_text: text, language, speaker: voice },
              setStatus,
            );
      setPreview(result);
      setStatus("Verified voice preview ready.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "No verified voice route could complete the preview.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      eyebrow="BUDDY • VOICE"
      title="Buddy's voice"
      icon={<Volume2 className="size-5" />}
      defaultOpen
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">
          Voice
          <select
            value={voice}
            onChange={(event) => chooseVoice(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm"
          >
            {sample && <option value="My voice">My voice — cloned from my sample</option>}
            {VOICES.map(([name, description]) => (
              <option key={name} value={name}>
                {name} — {description}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Language
          <select
            value={language}
            onChange={(event) => chooseLanguage(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm"
          >
            {LANGUAGES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/50 px-3 text-xs font-semibold">
          <Upload className="size-4 text-primary" /> Upload my voice sample
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void saveSample(file);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => void recordSample()}
          className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-background/50 px-3 text-left text-xs font-semibold"
        >
          <Mic2 className="size-4 text-primary" />{" "}
          {recording ? "Stop recording" : "Record my voice in Studio"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          {sample ? "Voice sample saved" : "No personal voice saved"}
        </span>
        {sample && (
          <button
            type="button"
            onClick={() => {
              void clearVoiceSample();
              setSample(null);
              if (voice === "My voice") chooseVoice("Ryan");
              setStatus("Personal voice removed from this device.");
            }}
            className="rounded-full border border-destructive/30 px-3 py-1.5 text-[11px] text-destructive"
          >
            <Trash2 className="mr-1 inline size-3" /> Remove
          </button>
        )}
        <StudioButton
          variant="ghost"
          disabled={busy || (voice === "My voice" && !sample)}
          onClick={() => void previewVoice()}
        >
          <Play className="size-4" /> {busy ? "Generating…" : "Test voice"}
        </StudioButton>
      </div>
      <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        {status}
      </div>
      {preview?.url && <audio src={preview.url} controls className="mt-3 w-full" />}
      {preview?.url && (
        <p className="mt-2 text-[0.65rem] text-emerald-400">
          <Check className="mr-1 inline size-3" /> The preview returned a verified audio artifact.
        </p>
      )}
      <p className="mt-2 text-[0.65rem] leading-4 text-muted-foreground">
        Only use a voice sample you own or have permission to clone. Personal samples are stored
        locally on this device until you remove them.
      </p>
    </Panel>
  );
}
