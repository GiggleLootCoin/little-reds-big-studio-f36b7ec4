import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Mic,
  MicOff,
  Paperclip,
  Phone,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { artifactText, runStudioJob } from "@/lib/studio-runtime";
import { setBuddyStatus } from "@/lib/buddy-presence";
import {
  acceptBuddyFile,
  attachmentSummary,
  buddyAccept,
  fileToDataUrl,
  revokeBuddyAttachment,
  type BuddyAttachment,
} from "@/lib/buddy-attachments";
import {
  listMicrophones,
  requestMicrophone,
  stopMicrophone,
  describeMicrophoneError,
  type MicrophoneInfo,
} from "@/lib/microphone";
import { Panel, StudioButton } from "./ui";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import "./BuddyVisual.css";
import { BuddyVoicePicker } from "./BuddyVoicePicker";
import { getBuddyVoiceProfile } from "@/lib/buddy-voice";

type Mode = "idle" | "live" | "record";
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: number; attachments?: Array<{ id: string; name: string; type: string; size: number; url?: string }> };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; abort: () => void;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string } & { isFinal?: boolean }>> }) => void) | null;
};
const KEY = "lrbgs-buddy-chat-v2";
const recognitionCtor = () => (window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as Window & { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export function BuddyLiveChat() {
  const [messages, setMessages] = useState<Message[]>([]); const [input, setInput] = useState(""); const [attachments, setAttachments] = useState<BuddyAttachment[]>([]);
  const [busy, setBusy] = useState(false); const [live, setLive] = useState(false); const [recording, setRecording] = useState(false); const [muted, setMuted] = useState(false); const [status, setStatus] = useState("Buddy is ready.");
  const [micOptions, setMicOptions] = useState<MicrophoneInfo[]>([]); const [micId, setMicId] = useState(""); const [transcript, setTranscript] = useState("");
  const streamRef = useRef<MediaStream | null>(null); const recorderRef = useRef<MediaRecorder | null>(null); const recognitionRef = useRef<Recognition | null>(null); const chunksRef = useRef<Blob[]>([]); const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<Mode>("idle"); const liveRef = useRef(false); const busyRef = useRef(false); const speakingRef = useRef(false); const recognitionTextRef = useRef(""); const recognitionRestartRef = useRef(false);

  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as Message[]; if (Array.isArray(saved)) setMessages(saved.slice(-50)); } catch { localStorage.removeItem(KEY); } void refreshMicrophones(); const onDeviceChange = () => void refreshMicrophones(); navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange); return () => { navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange); stopAll(); attachments.forEach(revokeBuddyAttachment); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-50).map(({ attachments: savedAttachments, ...message }) => ({ ...message, attachments: savedAttachments?.map(({ url: _url, ...metadata }) => metadata) })))); } catch {} }, [messages]);
  async function refreshMicrophones() { try { setMicOptions(await listMicrophones()); } catch { setMicOptions([]); } }
  function stopRecognition() { recognitionRestartRef.current = false; const recognition = recognitionRef.current; recognitionRef.current = null; if (recognition) { try { recognition.onend = null; recognition.abort(); } catch {} } }
  async function openMicrophone() { try { const stream = await requestMicrophone(micId && micId !== "default" ? micId : undefined); const track = stream.getAudioTracks()[0]; if (!track || track.readyState !== "live") { stopMicrophone(stream); throw new Error("Android did not provide a live microphone stream."); } streamRef.current = stream; await refreshMicrophones(); return stream; } catch (error) { const message = describeMicrophoneError(error); setStatus(message); setBuddyStatus("error", { message }); return null; } }
  async function transcribeBlob(blob: Blob) { if (!blob.size) throw new Error("I didn't catch any audio. Try again."); const result = await runStudioJob("speech-to-text", { audio: blob }, setStatus); const text = artifactText(result.value).trim(); if (!text) throw new Error("Speech recognition returned no usable text."); return text; }
  function startMediaRecorder(mode: Mode, stream: MediaStream) { if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record microphone audio."); const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type)); const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); chunksRef.current = []; modeRef.current = mode; recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); }; recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }); chunksRef.current = []; recorderRef.current = null; const captureMode = modeRef.current; modeRef.current = "idle"; setRecording(false); if (captureMode === "record") { stopMicrophone(streamRef.current); streamRef.current = null; if (!blob.size) return; void transcribeBlob(blob).then(setTranscript).then(() => setStatus("Transcription ready. Edit it or send it to Buddy.")).catch((error) => setStatus(error instanceof Error ? error.message : "Speech recognition failed.")); } else if (captureMode === "live" && liveRef.current && blob.size) { void transcribeBlob(blob).then((text) => answer(text, true)).catch((error) => { setStatus(error instanceof Error ? error.message : "Speech recognition failed."); if (liveRef.current) setTimeout(() => void beginCapture("live"), 500); }); } else { stopMicrophone(streamRef.current); streamRef.current = null; } }; recorderRef.current = recorder; recorder.start(250); setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" }); setStatus(mode === "live" ? "Listening… speak naturally, then pause." : "Recording… tap stop when you're done."); }

  function startBrowserRecognition(mode: Mode) {
    const Ctor = recognitionCtor(); if (!Ctor) return false; const recognition = new Ctor(); recognition.continuous = mode === "live"; recognition.interimResults = true; recognition.lang = localStorage.getItem("buddy-language") || navigator.language || "en-US"; recognitionTextRef.current = ""; modeRef.current = mode; recognitionRestartRef.current = mode === "live"; recognitionRef.current = recognition;
    recognition.onstart = () => { setRecording(true); setBuddyStatus("listening", { message: "Buddy is listening…" }); setStatus("Listening…"); };
    recognition.onresult = (event) => {
      let finalText = ""; let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) { const result = event.results[i]; const text = result[0]?.transcript || ""; if (result.isFinal) finalText += `${text} `; else interimText += `${text} `; }
      if (finalText.trim()) {
        recognitionTextRef.current = `${recognitionTextRef.current} ${finalText}`.trim();
        // On Android, continuous recognition can keep the session open forever.
        // Send the completed utterance immediately instead of waiting for onend.
        if (mode === "live" && liveRef.current && !busyRef.current && !speakingRef.current) {
          const text = recognitionTextRef.current.trim(); recognitionTextRef.current = ""; recognitionRestartRef.current = false;
          try { recognition.onend = null; recognition.stop(); } catch {}
          recognitionRef.current = null; setRecording(false); void answer(text, true);
          return;
        }
      }
      if (mode === "record") setTranscript(`${recognitionTextRef.current}${interimText ? ` ${interimText}` : ""}`.trim());
    };
    recognition.onerror = (event) => { const error = event.error || "unknown"; if (error === "not-allowed" || error === "service-not-allowed") { recognitionRestartRef.current = false; setStatus("Microphone permission was denied. Allow microphone access for this site, then tap Call Buddy again."); } else if (error !== "aborted" && !speakingRef.current) setStatus("Microphone input is unavailable; try the microphone button again."); };
    recognition.onend = () => { const text = recognitionTextRef.current.trim(); recognitionRef.current = null; setRecording(false); if (text) { recognitionTextRef.current = ""; if (mode === "record") { setTranscript(text); setStatus("Transcription ready. Edit it or send it to Buddy."); } else if (liveRef.current) void answer(text, true); } if (liveRef.current && mode === "live" && recognitionRestartRef.current && !speakingRef.current && !busyRef.current) setTimeout(() => { if (liveRef.current && !speakingRef.current) void beginCapture("live"); }, 250); else if (!liveRef.current && mode !== "record") setStatus(text ? "Buddy received you." : "I didn't catch that. Try again."); };
    try { recognition.start(); return true; } catch { recognitionRef.current = null; return false; }
  }

  async function beginCapture(mode: Mode) { if (busyRef.current || speakingRef.current || recording) return; if (mode === "live" && startBrowserRecognition("live")) return; const stream = streamRef.current?.active ? streamRef.current : await openMicrophone(); if (!stream) return; if (mode === "live") { startMediaRecorder("live", stream); window.setTimeout(() => { if (liveRef.current && recorderRef.current?.state === "recording") { try { recorderRef.current.stop(); } catch {} } }, 6500); return; } if (mode === "record") { if (startBrowserRecognition("record")) return; startMediaRecorder("record", stream); } }
  function stopCapture() { stopRecognition(); try { recorderRef.current?.stop(); } catch {} setRecording(false); }
  async function speak(text: string) { if (muted || speakingRef.current) return; stopRecognition(); speakingRef.current = true; setBuddyStatus("working", { message: "Buddy is speaking…" }); try { const voice = getBuddyVoiceProfile(); const voiceInput: Record<string, unknown> = { text, target_text: text, language: voice.language, ...(voice.mode === "clone" && voice.referenceDataUrl ? { referenceAudio: await (await fetch(voice.referenceDataUrl)).blob() } : { speaker: voice.speaker }) }; const result = await runStudioJob("tts", voiceInput, setStatus); if (!result.url) throw new Error("No voice artifact returned."); if (!audioRef.current) audioRef.current = new Audio(); const audio = audioRef.current; audio.src = result.url; audio.onended = () => { speakingRef.current = false; setBuddyStatus("idle"); if (liveRef.current) setTimeout(() => void beginCapture("live"), 200); }; audio.onerror = () => { speakingRef.current = false; if (liveRef.current) setTimeout(() => void beginCapture("live"), 200); }; await audio.play(); setStatus("Buddy is speaking…"); } catch { if ("speechSynthesis" in window) { window.speechSynthesis.resume(); await new Promise<void>((resolve) => { const utterance = new SpeechSynthesisUtterance(text); utterance.lang = localStorage.getItem("buddy-language") || navigator.language || "en-US"; utterance.rate = 0.98; utterance.pitch = 1.02; utterance.onend = () => resolve(); utterance.onerror = () => resolve(); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); }); } speakingRef.current = false; if (liveRef.current) setTimeout(() => void beginCapture("live"), 200); else setBuddyStatus("idle"); } }
  // The rest of this component is intentionally unchanged from main.
