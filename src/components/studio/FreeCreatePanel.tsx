import { useEffect, useMemo, useState } from "react";
import {
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
import { buildFullMusicVideoRequest } from "@/lib/media/track-package";
import { generateFullMusicVideo } from "@/lib/media/full-music-video";
import { saveLocalArtifact } from "@/lib/local-first/artifacts";
import { Note, Panel, Readout, StudioButton } from "./ui";
import { CreatorExportButton } from "./CreatorExportButton";

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

async function artifactBlob(artifact: StudioArtifact, expectedType: string): Promise<Blob> {
  if (artifact.value instanceof Blob && artifact.value.size) return artifact.value;
  if (!artifact.url) throw new Error(`The generated ${expectedType} has no downloadable artifact.`);
  const response = await fetch(artifact.url);
  if (!response.ok) throw new Error(`The generated ${expectedType} could not be downloaded.`);
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith(expectedType))
    throw new Error(`The generated ${expectedType} artifact could not be validated.`);
  return blob;
}

async function audioDurationSeconds(blob: Blob): Promise<number> {
  if (typeof Audio === "undefined") throw new Error("This browser cannot inspect generated audio duration.");
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio();
    audio.preload = "metadata";
    const duration = await new Promise<number>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("The generated song could not be decoded."));
      audio.src = url;
    });
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("The generated song has no valid duration.");
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mediaUrlsFromValue(value: unknown): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && /^(https?:|blob:|data:|\/)/i.test(value)) urls.push(value);
    if (!value || typeof value !== "object") return;
    if (value instanceof Blob) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of ["url", "uri", "src", "path"]) add(record[key]);
    for (const [key, nested] of Object.entries(record)) {
      if (!["url", "uri", "src", "path"].includes(key)) add(nested);
    }
  };
  add(value);
  return [...new Set(urls)];
}

async function fetchAudioBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio artifact download failed (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (!blob.size) throw new Error("Audio artifact was empty.");
  return blob;
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const output = new ArrayBuffer(44 + frames * channels * bytesPerSample);
  const view = new DataView(output);
  const write = (offset: number, text: string) =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + frames * channels * bytesPerSample, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frames * channels * bytesPerSample, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

async function buildRedCover(source: Blob, onStatus: (status: string) => void): Promise<Blob> {
  onStatus("1/4 — Separating vocals, drums, bass and other instruments…");
  const separated = await runStudioJob(
    "vocal-separation",
    {
      audio: source,
      model_name: "htdemucs_ft",
      vocals: true,
      drums: true,
      bass: true,
      other: true,
      mp3: false,
      mp3_bitrate: 192,
    },
    onStatus,
  );
  const urls = mediaUrlsFromValue(separated.value);
  if (separated.url && !urls.includes(separated.url)) urls.unshift(separated.url);
  if (urls.length < 5) {
    throw new Error(
      "The stem separator did not return the four individual stems. No mix was created, so the source song remains untouched.",
    );
  }

  const [mixedUrl, vocalsUrl, drumsUrl, bassUrl, otherUrl] = urls;
  void mixedUrl;
  onStatus("2/4 — Converting the isolated vocal with Red's trained RVC model…");
  const converted = await runStudioJob(
    "song-voice-swap",
    { audio: await fetchAudioBlob(vocalsUrl), targetVoice: "Red" },
    onStatus,
  );
  if (!converted.url) throw new Error("Red RVC returned no playable converted vocal.");
  const convertedVocal = converted.value instanceof Blob
    ? converted.value
    : await fetchAudioBlob(converted.url);

  onStatus("3/4 — Rebuilding the instrumental and mixing Red's converted vocal back in…");
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("This Android browser cannot mix the returned audio.");
  const decode = async (blob: Blob) => {
    const ctx = new AudioContextCtor();
    try {
      return await ctx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      await ctx.close().catch(() => undefined);
    }
  };
  const [drums, bass, other, vocal] = await Promise.all([
    decode(await fetchAudioBlob(drumsUrl)),
    decode(await fetchAudioBlob(bassUrl)),
    decode(await fetchAudioBlob(otherUrl)),
    decode(convertedVocal),
  ]);
  const sampleRate = Math.max(drums.sampleRate, bass.sampleRate, other.sampleRate, vocal.sampleRate);
  const duration = Math.max(drums.duration, bass.duration, other.duration, vocal.duration);
  const channels = 2;
  const offline = new OfflineAudioContext(channels, Math.ceil(duration * sampleRate), sampleRate);
  const connectStem = (buffer: AudioBuffer, gainValue: number) => {
    const sourceNode = offline.createBufferSource();
    sourceNode.buffer = buffer;
    const gain = offline.createGain();
    gain.gain.value = gainValue;
    sourceNode.connect(gain).connect(offline.destination);
    sourceNode.start(0);
  };
  connectStem(drums, 0.86);
  connectStem(bass, 0.86);
  connectStem(other, 0.86);
  connectStem(vocal, 1.0);
  const rendered = await offline.startRendering();
  const wav = audioBufferToWav(rendered);
  if (wav.size < 4096) throw new Error("The finished Red cover rendered as an empty audio file.");
  onStatus("4/4 — Verifying and saving the finished Red cover…");
  return wav;
}

export function FreeCreatePanel() {
  const [brief, setBrief] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [busy, setBusy] = useState<StudioCapability | "track-package" | "red-cover" | null>(null);
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
  const generateRedCover = async () => {
    if (busy || !sourceAudio) return;
    save();
    setBusy("red-cover");
    setArtifact(null);
    try {
      const finished = await buildRedCover(sourceAudio, setStatus);
      await saveLocalArtifact(finished, `${brief.trim() || sourceAudio.name.replace(/\\.[^.]+$/, "") || "red-cover"}-Red-cover.wav`);
      const url = URL.createObjectURL(finished);
      setArtifact({
        capability: "song-voice-swap",
        value: finished,
        url,
        provider: "Little Red's Big Studio — Demucs + Red RVC + local mix",
      });
      setStatus("Finished Red cover verified and saved on this device.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Red cover could not be completed. The original source file was not modified.",
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
      const musicBlob = await artifactBlob(music, "audio/");
      const actualSongDuration = await audioDurationSeconds(musicBlob);
      await saveLocalArtifact(musicBlob, `${brief.trim() || "generated-song"}.wav`);
      setTrackMusic({ ...music, value: musicBlob });

      setStatus("2/3 — Generating cover artwork for this exact track…");
      const artwork = await runStudioJob(
        "image",
        {
          prompt: `${brief.trim() || "Original song"}. Create the official cover artwork for this exact music track. Match the genre, mood, story, setting, and visual identity. No generic stock-photo look.`,
        },
        setStatus,
      );
      const artworkBlob = await artifactBlob(artwork, "image/");
      await saveLocalArtifact(artworkBlob, `${brief.trim() || "generated-song"}-artwork.png`);
      setTrackArtwork({ ...artwork, value: artworkBlob });

      setStatus(
        `3/3 — Building the complete ${Math.round(actualSongDuration)} second music video from the finished song…`,
      );
      const imageDataUrl = await blobToDataUrl(artworkBlob);
      const request = buildFullMusicVideoRequest({
        audio: musicBlob,
        audioDurationSeconds: actualSongDuration,
        title: brief.trim() || undefined,
        direction: brief.trim() || undefined,
        referenceImage: imageDataUrl || artworkBlob,
      });
      const video = await generateFullMusicVideo({
        audioBlob: request.audio as Blob,
        audioDurationSeconds: request.audioDurationSeconds,
        title: request.title,
        direction: request.direction,
        storyboard: request.storyboard,
        referenceImageBlob:
          request.referenceImage instanceof Blob
            ? request.referenceImage
            : imageDataUrl
              ? await (await fetch(imageDataUrl)).blob()
              : null,
        onProgress: (update) => setStatus(update.message),
      });
      await saveLocalArtifact(
        video.blob,
        `${brief.trim() || "generated-song"}-music-video.${video.mimeType.includes("mp4") ? "mp4" : "webm"}`,
      );
      const videoArtifact: StudioArtifact = {
        capability: "video",
        value: video.blob,
        url: URL.createObjectURL(video.blob),
        provider: `Full music-video renderer (${video.engine})`,
      };
      setTrackVideo(videoArtifact);
      setArtifact(music);
      setStatus(
        `Track package ready: the full ${Math.round(video.durationSeconds)} second song, matching artwork, and complete music video are verified and saved on this device.`,
      );
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
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
        <div className="flex items-start gap-3">
          <Music2 className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Make a complete Red cover</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              One button: separate the song, use Red's trained RVC model, rebuild the instrumental,
              mix the converted vocal back in, verify the WAV, and save it locally. No reference-voice
              upload is required.
            </p>
          </div>
        </div>
        <StudioButton
          className="mt-3 w-full"
          disabled={!sourceAudio || !!busy}
          onClick={() => void generateRedCover()}
        >
          <Music2 className="size-4" />
          {busy === "red-cover" ? "Making your Red cover…" : "Make My Red Cover"}
        </StudioButton>
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
          onClick={() => void run("video", { prompt: brief || "Cinematic short video" })}
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
        <TrackArtifact title="Complete Track Music Video" kind="video" url={trackVideo.url} />
      )}
      {artifact?.url && !trackMusic && (
        <TrackArtifact title="Verified result" kind={artifact.capability} url={artifact.url} />
      )}
      <Note>
        <Readout label="Routing" value="Automatic capability + live schema + fallback" />
        <Readout label="Track package" value="Full song + matching artwork + complete music video" />
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
        <CreatorExportButton
          kind={
            kind === "audio"
              ? "audio"
              : kind === "image"
                ? "image"
                : kind === "video"
                  ? "video"
                  : "audio"
          }
          url={url}
          title={title}
        />
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
