import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Mic2, Play, Square, Trash2, UserRound, Volume2 } from "lucide-react";
import { runStudioJob } from "@/lib/studio-runtime";
import {
  clearBuddyVoiceClone,
  getBuddyVoiceProfile,
  getBuddyVoiceSample,
  markBuddyCloneVerified,
  saveBuddyVoiceProfile,
} from "@/lib/buddy-voice";
import { saveLocalBuddyVoiceReference } from "@/lib/local-voice-reference";
import { BUDDY_MOODS, BUDDY_TONES, BUDDY_VOICE_PRESETS } from "@/lib/buddy-voice";
import { BUDDY_EXPANDED_LANGUAGES, BUDDY_EXPANDED_VOICES } from "@/lib/buddy-voice-expanded";
import { StudioButton } from "./ui";

const CLONE_TEXT =
  "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";
const REFERENCE_TRANSCRIPT = CLONE_TEXT;
const FAILURE = "Buddy couldn't create the voice clone yet.";
const PREVIEW_TEXT = "Hello. This is Buddy. This is a real voice preview, so you can listen before choosing this voice.";

export function BuddyVoicePicker() {
  const [profile, setProfile] = useState(getBuddyVoiceProfile());
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [presetCandidate, setPresetCandidate] = useState(profile.speaker);
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const [status, setStatus] = useState(
    "Choose a preset, or upload/record a voice sample to create a real clone.",
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const allVoices = useMemo(
    () => [
      {
        id: "Red",
        label: "Red — The Original Voice of Buddy",
        note: "Your real verified personal voice clone",
        nativeLanguage: "English",
        languages: ["English"],
        character: "Little Red’s own voice — the required Buddy voice.",
        family: "Buddy's Original Voice",
      },
      ...BUDDY_VOICE_PRESETS.map((v) => ({ ...v, family: "Buddy Originals" })),
      ...BUDDY_EXPANDED_VOICES.map((v) => ({
        ...v,
        family: "Aura Studio — 40 distinct English voices",
      })),
    ],
    [],
  );

  const setGeneratedAudio = (url: string) => {
    if (audioUrlRef.current && audioUrlRef.current !== url)
      URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = url;
    setAudioUrl(url);
  };

  const update = (patch: Partial<typeof profile>) => {
    const next = { ...getBuddyVoiceProfile(), ...patch };
    setProfile(next);
    setPresetCandidate(next.speaker);
    setPreviewVoice(null);
    saveBuddyVoiceProfile(next);
    const voice = allVoices.find((v) => v.id === next.speaker);
    setStatus(
      next.mode === "clone" || next.speaker === "Red"
        ? next.cloneVerified
          ? "✓ Your verified clone is ready for Buddy."
          : "Your sample is saved. Tap Generate My Voice Clone."
        : `${voice?.label || next.speaker} selected — ${voice?.note || "ready to test"}.`,
    );
  };

  const saveReference = async (file: File) => {
    if (!file.type.startsWith("audio/")) throw new Error("Please choose an audio recording.");
    if (file.size > 3_500_000) throw new Error("Use a clear 3–30 second recording under 3.5 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("The recording could not be read."));
      reader.readAsDataURL(file);
    });
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const duration = await new Promise<number>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("The recording could not be read."));
      audio.src = dataUrl;
    });
    if (!Number.isFinite(duration) || duration < 3 || duration > 30)
      throw new Error("Use a clear voice recording between 3 and 30 seconds.");
    await saveLocalBuddyVoiceReference(file);
    const next = {
      ...getBuddyVoiceProfile(),
      mode: "clone" as const,
      referenceDataUrl: dataUrl,
      referenceName: file.name,
      referenceTranscript: REFERENCE_TRANSCRIPT,
      cloneVerified: false,
      cloneVerifiedAt: undefined,
      cloneProvider: undefined,
    };
    saveBuddyVoiceProfile(next);
    setProfile(next);
    setStatus("Voice sample saved with its exact transcript. Tap Generate My Voice Clone.");
  };

  const uploadClone = async (file: File) => {
    setBusy(true);
    setStatus("Saving your voice sample locally…");
    try {
      await saveReference(file);
    } catch (error) {
      setStatus(
        `${FAILURE} ${error instanceof Error ? error.message : "The recording could not be saved."}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus(
        "Voice recording is not supported by this browser. Upload an audio sample instead.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-sample-${Date.now()}.webm`, { type: blob.type });
        await uploadClone(file);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus(`Read this sentence naturally: “${REFERENCE_TRANSCRIPT}”`);
    } catch {
      setStatus(`${FAILURE} Microphone access was not granted.`);
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const previewPreset = async () => {
    const speaker = String(presetCandidate || "").trim();
    if (!speaker) {
      setStatus("Choose a preset voice to preview.");
      return;
    }
    setBusy(true);
    setPreviewVoice(speaker);
    setStatus(`Generating a real preview for ${allVoices.find((v) => v.id === speaker)?.label || speaker}…`);
    try {
      const result = await runStudioJob(
        "tts",
        {
          speaker,
          language: profile.language || "English",
          text: PREVIEW_TEXT,
          target_text: PREVIEW_TEXT,
        },
        setStatus,
      );
      if (!result.url) throw new Error("The selected voice returned no playable audio.");
      setGeneratedAudio(result.url);
      setStatus("✓ Real preset preview ready — press Play below, then use this voice if you like it.");
    } catch (error) {
      setStatus(
        `Voice preview failed. ${error instanceof Error ? error.message : "The voice engine failed."}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    console.info("[BuddyVoiceDiagnostic] TEST_ENTERED");
    setBusy(true);
    setStatus("Generating your real voice clone…");
    console.info("[BuddyVoiceDiagnostic] BUSY_STATUS_SET");
    try {
      const current = getBuddyVoiceProfile();
      if (current.mode === "clone" || current.speaker === "Red") {
        const sample = await getBuddyVoiceSample();
        if (!sample) throw new Error("Your voice sample is missing. Upload or record it again.");
        const referenceTranscript = current.referenceTranscript || REFERENCE_TRANSCRIPT;
        const result = await runStudioJob(
          "voice-clone",
          {
            refAudio: sample,
            referenceAudio: sample,
            audio: sample,
            referenceTranscript,
            refText: referenceTranscript,
            target_text: CLONE_TEXT,
            text: CLONE_TEXT,
            language: current.language || "English",
          },
          setStatus,
        );
        if (!result.url) throw new Error("The clone engine returned no playable audio.");
        setGeneratedAudio(result.url);
        await markBuddyCloneVerified(result.provider);
        setProfile(getBuddyVoiceProfile());
        setStatus("✓ REAL VOICE CLONE READY — press Play on the audio player below.");
        return;
      }
      const result = await runStudioJob(
        "voice-clone",
        {
          speaker: current.speaker,
          language: current.language || "English",
          text: CLONE_TEXT,
          target_text: CLONE_TEXT,
          refText: REFERENCE_TRANSCRIPT,
        },
        setStatus,
      );
      if (!result.url) throw new Error("The voice engine returned no playable audio.");
      setGeneratedAudio(result.url);
      setStatus("✓ Voice sample generated — press Play below.");
    } catch (error) {
      setStatus(
        `${FAILURE} ${error instanceof Error ? error.message : "The voice engine failed."}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateClick = () => {
    console.info("[BuddyVoiceDiagnostic] GENERATE_CLICKED");
    void test();
  };

  const removeClone = async () => {
    await clearBuddyVoiceClone();
    setGeneratedAudio("");
    const next = getBuddyVoiceProfile();
    setProfile(next);
    setStatus("Voice clone removed. Upload or record a new sample to continue.");
  };

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
          <UserRound className="size-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Buddy Voice Lab</h3>
          <p className="text-[10px] text-muted-foreground">Local-first voice cloning for Buddy</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => update({ mode: "preset" })}
          className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "preset" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}
        >
          <Play className="mb-1 size-4 text-primary" /> Preset Voices
          <span className="mt-1 block text-[9px] text-muted-foreground">
            Real selectable speaker IDs
          </span>
        </button>
        <button
          type="button"
          onClick={() => update({ mode: "clone" })}
          className={`rounded-xl border px-3 py-2 text-left text-xs ${profile.mode === "clone" ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}
        >
          <Mic2 className="mb-1 size-4 text-primary" /> Clone a Voice
          <span className="mt-1 block text-[9px] text-muted-foreground">
            Upload or record • no typing required
          </span>
        </button>
      </div>
      {profile.mode === "preset" ? (
        <div className="mt-2 rounded-xl border border-border bg-background/40 p-2">
          <select
            value={presetCandidate}
            onChange={(e) => {
              setPresetCandidate(e.target.value);
              setPreviewVoice(null);
              setStatus("Preset selected for preview — it is not committed until you use this voice.");
            }}
            className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-xs"
          >
            {["Buddy's Original Voice", "Buddy Originals", "Aura Studio — 40 distinct English voices"].map(
              (family) => (
                <optgroup key={family} label={family}>
                  {allVoices
                    .filter((v) => v.family === family)
                    .map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label} — {voice.note}
                      </option>
                    ))}
                </optgroup>
              ),
            )}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StudioButton
              type="button"
              className="w-full justify-center"
              onClick={() => void previewPreset()}
              disabled={busy}
              aria-busy={busy && previewVoice === presetCandidate}
            >
              <Volume2 className="size-4" /> {busy && previewVoice === presetCandidate ? "Previewing…" : "Preview Voice"}
            </StudioButton>
            <button
              type="button"
              onClick={() => update({ mode: "preset", speaker: presetCandidate })}
              disabled={busy}
              className="rounded-xl border border-primary bg-primary/10 px-3 py-2 text-xs font-semibold"
            >
              <CheckCircle2 className="mr-1 inline size-4" /> Use This Voice
            </button>
          </div>
          {audioUrl && previewVoice === presetCandidate && (
            <div className="mt-2 rounded-xl border border-primary/30 bg-background/70 p-2">
              <p className="mb-2 text-[10px] font-semibold text-primary">Preset voice preview</p>
              <audio className="w-full" controls preload="metadata" src={audioUrl} />
            </div>
          )}
          <p
            role="status"
            aria-live="polite"
            className="mt-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground"
          >
            {status}
          </p>
        </div>
      ) : (
        <div className="mt-2 rounded-xl border border-primary/30 bg-background/60 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {profile.cloneVerified ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <Mic2 className="size-4 text-primary" />
            )}
            {profile.cloneVerified ? "Your Voice Clone — READY" : "Create Your Voice Clone"}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {profile.cloneVerified
              ? `Verified with ${profile.cloneProvider || "a real clone engine"}. Buddy can use it now.`
              : `Read this exact sentence for the strongest clone: “${REFERENCE_TRANSCRIPT}”`}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-xl border border-border bg-background/50 px-3 py-3 text-center text-xs font-semibold">
              <Volume2 className="mx-auto mb-1 size-5 text-primary" /> Upload Sample
              <span className="mt-1 block text-[9px] font-normal text-muted-foreground">
                3–30 seconds
              </span>
              <input
                className="sr-only"
                type="file"
                accept="audio/*"
                disabled={busy || recording}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadClone(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                disabled={busy}
                className="rounded-xl border border-primary bg-primary/10 px-3 py-3 text-center text-xs font-semibold"
              >
                <Square className="mx-auto mb-1 size-5 text-primary" /> Stop Recording
                <span className="mt-1 block text-[9px] font-normal text-muted-foreground">
                  Save this sample
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={busy}
                className="rounded-xl border border-border bg-background/50 px-3 py-3 text-center text-xs font-semibold"
              >
                <Mic2 className="mx-auto mb-1 size-5 text-primary" /> Record Sample
                <span className="mt-1 block text-[9px] font-normal text-muted-foreground">
                  Read the sentence above
                </span>
              </button>
            )}
          </div>
          <p
            role="status"
            aria-live="polite"
            className="mt-3 rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground"
          >
            {status}
          </p>
          <StudioButton
            type="button"
            className="mt-3 w-full justify-center"
            onClick={handleGenerateClick}
            disabled={busy || recording}
            aria-busy={busy}
          >
            <Mic2 className="size-4" />{" "}
            {busy ? "Generating Your Voice Clone…" : "Generate My Voice Clone"}
          </StudioButton>
          {audioUrl && (
            <div className="mt-3 rounded-xl border border-primary/30 bg-background/70 p-2">
              <p className="mb-2 text-[10px] font-semibold text-primary">
                Your generated voice sample
              </p>
              <audio className="w-full" controls preload="metadata" src={audioUrl} />
            </div>
          )}
          {profile.cloneVerified && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-primary">
                Verified clone saved and ready for Buddy.
              </span>
              <button
                type="button"
                onClick={() => void removeClone()}
                className="rounded-xl border border-border px-3 py-2 text-xs"
              >
                <Trash2 className="mr-1 inline size-3.5" /> Remove
              </button>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="text-[10px] font-semibold text-muted-foreground">
          Language
          <select
            value={profile.language || "English"}
            onChange={(e) => update({ language: e.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground"
          >
            {BUDDY_EXPANDED_LANGUAGES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-semibold text-muted-foreground">
          Mood
          <select
            value={profile.mood || "natural"}
            onChange={(e) => update({ mood: e.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground"
          >
            {BUDDY_MOODS.map((mood) => (
              <option key={mood.id} value={mood.id}>
                {mood.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-semibold text-muted-foreground">
          Tone
          <select
            value={profile.tone || "conversational"}
            onChange={(e) => update({ tone: e.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-background/70 px-2 py-2 text-xs font-normal text-foreground"
          >
            {BUDDY_TONES.map((tone) => (
              <option key={tone.id} value={tone.id}>
                {tone.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
