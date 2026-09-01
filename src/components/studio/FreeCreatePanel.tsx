import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Film,
  Image,
  LoaderCircle,
  MessageCircle,
  Mic2,
  Music2,
  Scissors,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  artifactText,
  runStudioJob,
  type StudioArtifact,
  type StudioCapability,
} from "@/lib/studio-runtime";
import { Note, Panel, Readout, StudioButton } from "./ui";

function explicitDurationRequest(brief: string) {
  const match = brief.match(
    /(?:about|around|roughly|exactly|for|of)?\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)/i,
  );
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return unit.startsWith("min") ? Math.round(amount * 60) : Math.round(amount);
}

async function blobToDataUrl(value: unknown): Promise<string | null> {
  if (!(value instanceof Blob) || !value.size) return null;
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(value);
  });
}

export function FreeCreatePanel() {
  const [brief, setBrief] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [busy, setBusy] = useState<StudioCapability | "track-package" | null>(null);
  const [status, setStatus] = useState(
    "Buddy will choose a compatible free route and verify the returned result.",
  );
  const [artifact, setArtifact] = useState<StudioArtifact | null>(null);
  const [trackMusic, setTrackMusic] = useState<StudioArtifact | null>(null);
  const [trackArtwork, setTrackArtwork] = useState<StudioArtifact | null>(null);
  const [trackVideo, setTrackVideo] = useState<StudioArtifact | null>(null);
  const [sourceAudio, setSourceAudio] = useState<File | null>(null);
  const [referenceVoice, setReferenceVoice] = useState<File | null>(null);
  useEffect(() => {
    setBrief(localStorage.getItem("lrbgs-song-brief") || "");
    setLyrics(localStorage.getItem("lrbgs-lyrics") || "");
  }, []);
  const requestedDuration = useMemo(() => explicitDurationRequest(brief), [brief]);
  const songPrompt = useMemo(
    () =>
      `${brief.trim() || "Create an original song"}\nLyrics:\n${lyrics.trim() || "Write suitable original lyrics."}`,
    [brief, lyrics],
  );
  const lyricPrompt = useMemo(
    () =>
      `Write original song lyrics from this brief. Include clear verse/chorus structure and keep the words singable.\n\n${brief.trim() || "Create an emotionally engaging original song."}`,
    [brief],
  );
  const save = () => {
    localStorage.setItem("lrbgs-song-brief", brief);
    localStorage.setItem("lrbgs-lyrics", lyrics);
  };
  const run = async (capability: StudioCapability, input: Record<string, unknown>) => {
    if (busy) return;
    save();
    setBusy(capability);
    setArtifact(null);
    try {
      const result = await runStudioJob(capability, input, setStatus);
      setArtifact(result);
      if (capability === "chat") {
        const text = artifactText(result.value);
        if (text) setLyrics(text);
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "No verified route could complete this job.",
      );
    } finally {
      setBusy(null);
    }
  };
  const generateTrackPackage = async () => {
    if (busy) return;
    save();
    setBusy("track-package");
    setArtifact(null);
    setTrackMusic(null);
    setTrackArtwork(null);
    setTrackVideo(null);
    try {
      setStatus("1/3 — Generating the actual music track…");
      const music = await runStudioJob(
        "music",
        {
          prompt: songPrompt,
          description: brief.trim() || "Create an original song",
          lyrics,
          instrumental: false,
          ...(requestedDuration ? { duration: requestedDuration } : {}),
        },
        setStatus,
      );
      setTrackMusic(music);
      setStatus("2/3 — Generating cover artwork for this exact track…");
      const artwork = await runStudioJob(
        "image",
        {
          prompt: `${brief.trim() || "Original song"}. Create the official cover artwork for this exact music track. Match the genre, mood, story, setting, and visual identity. No generic stock-photo look.`,
        },
        setStatus,
      );
      setTrackArtwork(artwork);
      setStatus("3/3 — Animating that artwork into the track's music video…");
      const imageDataUrl = await blobToDataUrl(artwork.value);
      const video = await runStudioJob(
        "video",
        {
          prompt: `${brief.trim() || "Original song"}. Create a cinematic music video for this exact track. Keep the visual identity, characters, setting, color language, and mood consistent with the cover artwork.`,
          ...(imageDataUrl ? { image: imageDataUrl } : {}),
          ...(requestedDuration
            ? { duration: Math.min(12, Math.max(4, requestedDuration)) }
            : { duration: 5 }),
          aspectRatio: "16:9",
          resolution: "720p",
        },
        setStatus,
      );
      setTrackVideo(video);
      setArtifact(music);
      setStatus("Track package ready: music + artwork + video are all generated.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Track package generation failed before completion.",
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel
      eyebrow="Free Core"
      title="Create — Buddy runs the machinery"
      icon={<Music2 className="size-5" />}
      defaultOpen
    >
      <p className="text-sm text-muted-foreground">
        Buddy checks a live compatible route, runs it, validates the returned result and falls back
        when necessary.
      </p>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={4}
        placeholder="Describe the song, artwork or video: genre, mood, tempo, instruments, visual world…"
        className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        rows={7}
        placeholder="Paste lyrics here, or leave blank and let Buddy write them first."
        className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
        <span className="font-semibold text-foreground">Natural track length.</span> Buddy lets the
        music engine decide how long the result should be unless you explicitly request a duration
        in your brief.
        {requestedDuration ? (
          <span className="ml-1 text-primary">
            {" "}
            Explicit request detected: about{" "}
            {requestedDuration >= 60
              ? `${(requestedDuration / 60).toFixed(requestedDuration % 60 ? 1 : 0)} min`
              : `${requestedDuration} sec`}
            .
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background/50 p-3 text-xs">
          <Upload className="size-4 text-primary" />
          <span className="min-w-0 flex-1">
            <strong className="block">Source song/audio</strong>
            <span className="block truncate text-muted-foreground">
              {sourceAudio?.name || "Choose audio for stems/voice swap"}
            </span>
          </span>
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => setSourceAudio(e.target.files?.[0] || null)}
          />
        </label>
        <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background/50 p-3 text-xs">
          <Mic2 className="size-4 text-primary" />
          <span className="min-w-0 flex-1">
            <strong className="block">Your reference voice</strong>
            <span className="block truncate text-muted-foreground">
              {referenceVoice?.name || "Choose a voice sample"}
            </span>
          </span>
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => setReferenceVoice(e.target.files?.[0] || null)}
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <StudioButton
          className="w-full"
          disabled={!!busy}
          onClick={() => void generateTrackPackage()}
        >
          <Music2 className="size-4" />
          {busy === "track-package" ? "Building track package…" : "Generate Track + Art + Video"}
        </StudioButton>
        <StudioButton
          variant="ghost"
          className="w-full"
          disabled={!!busy}
          onClick={() => void run("chat", { prompt: lyricPrompt, text: lyricPrompt })}
        >
          <MessageCircle className="size-4" />
          {busy === "chat" ? "Writing…" : "Generate lyrics"}
        </StudioButton>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <EngineButton
          icon={Mic2}
          title="Singing Voice Swap"
          disabled={!sourceAudio || !referenceVoice || !!busy}
          onClick={() =>
            void run("singing-voice-conversion", {
              audio: sourceAudio,
              refAudio: referenceVoice,
              f0_condition: true,
            })
          }
        />
        <EngineButton
          icon={Mic2}
          title="Voice / RVC"
          disabled={!sourceAudio || !referenceVoice || !!busy}
          onClick={() => void run("voice-swap", { audio: sourceAudio, refAudio: referenceVoice })}
        />
        <EngineButton
          icon={Image}
          title="Artwork"
          disabled={!!busy}
          onClick={() =>
            void run("image", {
              prompt: brief || "Premium cinematic cover artwork for an original song",
            })
          }
        />
        <EngineButton
          icon={Film}
          title="Video"
          disabled={!!busy}
          onClick={() => void run("video", { prompt: brief || "Cinematic music video" })}
        />
        <EngineButton
          icon={Scissors}
          title="Split stems"
          disabled={!sourceAudio || !!busy}
          onClick={() => void run("vocal-separation", { audio: sourceAudio })}
        />
        <EngineButton
          icon={Sparkles}
          title="Buddy chat"
          disabled={!!busy}
          onClick={() =>
            void run("chat", { prompt: brief || "Help me develop this creative idea." })
          }
        />
      </div>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        {busy ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" /> {status}
          </span>
        ) : (
          status
        )}
      </div>
      {trackMusic?.url && (
        <TrackArtifact title="Generated Music" kind="audio" url={trackMusic.url} />
      )}
      {trackArtwork?.url && (
        <TrackArtifact title="Track Artwork" kind="image" url={trackArtwork.url} />
      )}
      {trackVideo?.url && (
        <TrackArtifact title="Track Music Video" kind="video" url={trackVideo.url} />
      )}
      {artifact?.url && !trackMusic && (
        <TrackArtifact title="Verified result" kind={artifact.capability} url={artifact.url} />
      )}
      <Note>
        <Readout label="Routing" value="Automatic capability + live schema + fallback" />
        <Readout label="Track package" value="Music + matching artwork + matching video" />
        <Readout label="Voice" value="Speaking clone + singing voice conversion" />
        <Readout label="Cost target" value="Free/open first" />
        <Readout label="Success rule" value="Usable artifact required" />
      </Note>
    </Panel>
  );
}
function TrackArtifact({
  title,
  kind,
  url,
}: {
  title: string;
  kind: StudioCapability | "audio";
  url: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{title}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs"
        >
          <Download className="size-3" /> Save
        </a>
      </div>
      {kind === "image" ? (
        <img src={url} alt={title} className="max-h-96 w-full rounded-xl object-contain" />
      ) : kind === "video" ? (
        <video src={url} controls className="w-full rounded-xl" />
      ) : (
        <audio src={url} controls className="w-full" />
      )}
    </div>
  );
}
function EngineButton({
  icon: Icon,
  title,
  disabled,
  onClick,
}: {
  icon: typeof Music2;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group rounded-xl border border-border/70 bg-background/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Icon className="size-4 text-primary" />
      <span className="mt-2 block font-display text-xs font-semibold">{title}</span>
      <span className="mt-1 block text-[0.62rem] text-muted-foreground">
        Buddy handles the engine
      </span>
    </button>
  );
}
