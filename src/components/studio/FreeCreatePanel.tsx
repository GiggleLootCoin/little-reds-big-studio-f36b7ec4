import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Film,
  Image,
  MessageCircle,
  Mic2,
  Music2,
  Save,
  Scissors,
} from "lucide-react";
import { FREE_RUNNERS } from "@/lib/free-runners";
import { Note, Panel, Readout, StudioButton, StudioSlider } from "./ui";

function runner(id: string) {
  return FREE_RUNNERS.find((r) => r.id === id)!;
}

export function FreeCreatePanel() {
  const [brief, setBrief] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [seconds, setSeconds] = useState(180);
  const [copied, setCopied] = useState(false);
  const ace = runner("hf-ace-step");
  const rvc = runner("hf-rvc");
  const image = runner("hf-qwen-image");
  const imageFallback = runner("hf-z-image");
  const video = runner("hf-wan-s2v");
  const videoFallback = runner("hf-ltx-23");
  const stems = runner("hf-demucs");
  const chat = runner("bonsai-webgpu");

  useEffect(() => {
    setBrief(localStorage.getItem("lrbgs-song-brief") || "");
    setLyrics(localStorage.getItem("lrbgs-lyrics") || "");
  }, []);

  const songPrompt = useMemo(
    () =>
      `${brief.trim() || "Create an original song"}\nLength: ${seconds}s\nLyrics:\n${lyrics.trim() || "Write suitable original lyrics."}`,
    [brief, lyrics, seconds],
  );

  const lyricPrompt = useMemo(
    () =>
      `Write original song lyrics from this brief. Include a clear verse/chorus structure and keep the words singable.\n\n${brief.trim() || "Create an emotionally engaging original song."}`,
    [brief],
  );

  const launch = async (url: string, text?: string) => {
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // Clipboard permissions are optional; the destination still opens.
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const save = () => {
    localStorage.setItem("lrbgs-song-brief", brief);
    localStorage.setItem("lrbgs-lyrics", lyrics);
  };

  return (
    <Panel
      eyebrow="Free Core"
      title="Create — no API, no paywall"
      icon={<Music2 className="size-5" />}
      defaultOpen
    >
      <p className="text-sm text-muted-foreground">
        Buddy prepares the job and opens a current free/open runner. The Studio does not pretend an
        external generator finished until you actually receive its artifact.
      </p>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={4}
        placeholder="Describe the song: genre, mood, tempo, instruments, vocal character, structure..."
        className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        rows={7}
        placeholder="Paste your lyrics here, or leave blank and generate them first."
        className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <StudioSlider
        label="Target length"
        value={seconds}
        min={30}
        max={600}
        step={5}
        unit="s"
        onChange={setSeconds}
      />
      <div className="grid grid-cols-2 gap-2">
        <StudioButton
          className="w-full"
          onClick={() => {
            save();
            void launch(ace.url, songPrompt);
          }}
        >
          <Music2 className="size-4" />
          {copied ? "Prompt copied" : "Generate song"}
        </StudioButton>
        <StudioButton
          variant="ghost"
          className="w-full"
          onClick={() => void launch(chat.url, lyricPrompt)}
        >
          <MessageCircle className="size-4" /> Generate lyrics
        </StudioButton>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <EngineButton
          icon={Mic2}
          title="Voice / RVC"
          note={rvc.name}
          onClick={() => void launch(rvc.url)}
        />
        <EngineButton
          icon={Image}
          title="Artwork"
          note={image.name}
          onClick={() => void launch(image.url, brief)}
        />
        <EngineButton
          icon={Film}
          title="Video"
          note={video.name}
          onClick={() => void launch(video.url, brief)}
        />
        <EngineButton
          icon={Scissors}
          title="Split stems"
          note={stems.name}
          onClick={() => void launch(stems.url)}
        />
        <EngineButton
          icon={MessageCircle}
          title="Unlimited free chat"
          note="WebGPU"
          onClick={() => void launch(chat.url, brief)}
        />
        <EngineButton
          icon={ExternalLink}
          title="Video fallback"
          note={videoFallback.name}
          onClick={() => void launch(videoFallback.url, brief)}
        />
        <EngineButton
          icon={Image}
          title="Image fallback"
          note={imageFallback.name}
          onClick={() => void launch(imageFallback.url, brief)}
        />
        <EngineButton
          icon={ExternalLink}
          title="ACE-Step"
          note="Open music studio"
          onClick={() => void launch(ace.url, songPrompt)}
        />
      </div>
      <Note>
        <Readout label="Primary music engine" value={ace.name} />
        <Readout label="Image route" value={image.name} />
        <Readout label="Video routes" value={`${video.name} → ${videoFallback.name}`} />
        <Readout label="Cost" value="Free / no Studio API key" />
        <Readout label="Storage" value="Local browser storage" />
      </Note>
    </Panel>
  );
}

function EngineButton({
  icon: Icon,
  title,
  note,
  onClick,
}: {
  icon: typeof Music2;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-border/70 bg-background/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5"
    >
      <Icon className="size-4 text-primary" />
      <span className="mt-2 block font-display text-xs font-semibold">{title}</span>
      <span className="mt-1 block truncate text-[0.62rem] text-muted-foreground">{note}</span>
      <Copy className="mt-2 size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
