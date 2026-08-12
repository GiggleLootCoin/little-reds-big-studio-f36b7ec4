import { useEffect, useMemo, useState } from "react";
import { Download, Film, Image, MessageCircle, Mic2, Music2, Save, Scissors } from "lucide-react";
import { executeFreeGeneration, type GenerationKind, type GenerationResult } from "@/lib/free-execution";
import { Note, Panel, Readout, StudioButton, StudioSlider } from "./ui";

export function FreeCreatePanel() {
  const [brief, setBrief] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [seconds, setSeconds] = useState(180);
  const [busy, setBusy] = useState<GenerationKind | null>(null);
  const [status, setStatus] = useState("Buddy is ready.");
  const [result, setResult] = useState<GenerationResult | null>(null);

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

  const save = () => {
    localStorage.setItem("lrbgs-song-brief", brief);
    localStorage.setItem("lrbgs-lyrics", lyrics);
    setStatus("Saved on this device.");
  };

  const generate = async (kind: GenerationKind) => {
    if (busy) return;
    setBusy(kind);
    setResult(null);
    try {
      const input: Record<string, unknown> =
        kind === "lyrics"
          ? { prompt: lyricPrompt, text: lyricPrompt, lyrics: lyricPrompt }
          : kind === "music"
            ? { prompt: songPrompt, text: songPrompt, lyrics, duration: seconds }
            : { prompt: brief || "Create something excellent for my project.", text: brief, duration: seconds };
      const generated = await executeFreeGeneration(kind, input, setStatus);
      setResult(generated);
      if (generated.text && kind === "lyrics") {
        setLyrics(generated.text);
        localStorage.setItem("lrbgs-lyrics", generated.text);
      }
      setStatus("Finished — Buddy received a real result and validated the output.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed after the available free routes were tried.");
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    if (!result?.artifactUrl) return;
    const link = document.createElement("a");
    link.href = result.artifactUrl;
    link.download = `little-reds-big-studio-${result.kind}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  return (
    <Panel eyebrow="Buddy • Free Core" title="Create real results" icon={<Music2 className="size-5" />} defaultOpen>
      <p className="text-sm text-muted-foreground">
        Buddy now runs compatible public engines from inside the Studio, discovers their live API shape,
        validates the returned result and silently tries another route when a free engine is asleep or busy.
      </p>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={4}
        placeholder="Describe the song, artwork, video or creative result you want…"
        className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        rows={7}
        placeholder="Paste lyrics here, or generate them first."
        className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <StudioSlider label="Target length" value={seconds} min={30} max={600} step={5} unit="s" onChange={setSeconds} />

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground" aria-live="polite">
        {busy ? `Buddy is working on ${busy}… ` : "Status: "}{status}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StudioButton onClick={() => void generate("music")} disabled={!!busy} className="w-full">
          <Music2 className="size-4" /> Generate song
        </StudioButton>
        <StudioButton variant="ghost" onClick={() => void generate("lyrics")} disabled={!!busy} className="w-full">
          <MessageCircle className="size-4" /> Generate lyrics
        </StudioButton>
        <StudioButton variant="ghost" onClick={() => void generate("image")} disabled={!!busy} className="w-full">
          <Image className="size-4" /> Generate artwork
        </StudioButton>
        <StudioButton variant="ghost" onClick={() => void generate("video")} disabled={!!busy} className="w-full">
          <Film className="size-4" /> Generate video
        </StudioButton>
        <StudioButton variant="ghost" onClick={() => void generate("stems")} disabled={!!busy} className="w-full">
          <Scissors className="size-4" /> Separate stems
        </StudioButton>
        <StudioButton variant="ghost" onClick={save} disabled={!!busy} className="w-full">
          <Save className="size-4" /> Save project inputs
        </StudioButton>
      </div>

      {result && (
        <div className="rounded-2xl border border-border bg-background/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Verified result</p>
              <p className="text-sm text-muted-foreground">{result.kind} • Buddy validated a returned artifact.</p>
            </div>
            {result.artifactUrl && (
              <StudioButton variant="ghost" onClick={download}>
                <Download className="size-4" /> Save result
              </StudioButton>
            )}
          </div>
          {result.text && (
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-sm text-foreground">
              {result.text}
            </pre>
          )}
          {result.artifactUrl && (
            <a href={result.artifactUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block truncate text-xs text-primary underline">
              Open returned artifact
            </a>
          )}
        </div>
      )}

      <Note>
        <Readout label="Execution" value="Internal Studio orchestration" />
        <Readout label="Provider policy" value="Free/open + automatic fallback" />
        <Readout label="Artifact rule" value="No success without returned output" />
        <Readout label="API key" value="Not required for the public routes" />
      </Note>

      <div className="sr-only" aria-hidden="true">
        <Mic2 />
      </div>
    </Panel>
  );
}
