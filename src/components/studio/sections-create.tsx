import { useEffect, useRef, useState } from "react";
import { Clapperboard, Download, Film, Scissors, SlidersHorizontal, UploadCloud } from "lucide-react";
import { Chip, Note, Panel, Readout, StudioButton, StudioSlider } from "./ui";
import { setStudio, useStudio } from "@/lib/studio-store";
import { FREE_RUNNERS } from "@/lib/free-runners";
import { generateFullMusicVideo } from "@/lib/media/full-music-video";

const runner = (id: string) => FREE_RUNNERS.find((r) => r.id === id)!;

export function QRangePanel() {
  const studio = useStudio();
  const q = studio.qrange;
  const [applied, setApplied] = useState(false);
  const update = (patch: Partial<typeof q>) => setStudio({ qrange: { ...q, ...patch } });
  return (
    <Panel eyebrow="Mix core" title="Red's QRange" icon={<SlidersHorizontal className="size-5" />} defaultOpen>
      <p className="text-sm text-muted-foreground">Lightweight session controls stored locally. No account or API key required.</p>
      <StudioSlider label="Q range" value={q.range} onChange={(v) => update({ range: v })} />
      <StudioSlider label="Harmonic warmth" value={q.warmth} onChange={(v) => update({ warmth: v })} />
      <StudioSlider label="Bus glue" value={q.glue} onChange={(v) => update({ glue: v })} />
      <StudioSlider label="True-peak ceiling" value={q.ceiling} min={-3} max={0} step={0.1} unit=" dB" onChange={(v) => update({ ceiling: v })} />
      <div className="flex flex-wrap gap-2"><Chip>Radio-ready</Chip><Chip>Local session</Chip><Chip>No API</Chip></div>
      <StudioButton className="w-full" onClick={() => { setApplied(true); window.setTimeout(() => setApplied(false), 1600); }}>{applied ? "Applied ✔" : "Apply QRange"}</StudioButton>
    </Panel>
  );
}

export function UploadPanel() {
  const studio = useStudio();
  const [files, setFiles] = useState<Array<{ name: string; url: string; kind: "audio" | "image" }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;
    for (const file of Array.from(list)) {
      const kind = file.type.startsWith("audio") ? "audio" : "image";
      const url = URL.createObjectURL(file);
      setFiles((current) => [...current, { name: file.name, url, kind }]);
      if (kind === "audio") setStudio({ audioUrl: url, audioName: file.name, audioPath: `local:${file.name}` });
      else setStudio({ referenceUrl: url, referencePath: `local:${file.name}` });
    }
  };
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files]);
  return (
    <Panel eyebrow="Local files" title="Audio, Voice & File Uploads" icon={<UploadCloud className="size-5" />}>
      <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-border bg-background/40 p-7 text-center transition-colors hover:border-primary hover:bg-primary/5">
        <UploadCloud className="mx-auto mb-2 size-8 text-primary" />
        <p className="font-display text-sm">Choose audio or reference imagery</p>
        <p className="mt-1 text-xs text-muted-foreground">The browser holds this session. No paid storage backend.</p>
        <input ref={inputRef} hidden type="file" multiple accept="audio/*,image/*" onChange={(e) => add(e.target.files)} />
      </button>
      {files.length > 0 && <div className="space-y-2">{files.map((file) => <div key={`${file.name}-${file.url}`} className="rounded-xl border border-border bg-background/50 p-3">
        {file.kind === "audio" ? <audio controls src={file.url} className="w-full" /> : <img src={file.url} alt={file.name} className="max-h-48 w-full rounded-lg object-contain" />}
        <p className="mt-2 text-xs text-muted-foreground">{file.name}</p>
      </div>)}</div>}
      <div className="grid grid-cols-3 gap-2"><Readout label="Storage" value="Browser" /><Readout label="API key" value="None" /><Readout label="Account" value="None" /></div>
    </Panel>
  );
}

export function LabPanel() {
  const studio = useStudio();
  const demucs = runner("hf-demucs");
  const [levels, setLevels] = useState([82, 76, 71, 68]);
  const names = ["Vocals", "Drums", "Bass", "Other"];
  return (
    <Panel eyebrow="Audio lab" title="Red'sLab Stem Studio" icon={<Scissors className="size-5" />}>
      <p className="text-sm text-muted-foreground">Local mixer controls plus the best free/open stem separator.</p>
      {studio.audioUrl ? <audio controls src={studio.audioUrl} className="w-full" /> : <Note>Upload a track above first.</Note>}
      <div className="space-y-2">{names.map((name, i) => <div key={name} className="rounded-xl border border-border bg-background/40 p-3">
        <div className="mb-2 flex justify-between"><span className="font-display text-sm">{name}</span><span className="text-xs text-muted-foreground">{levels[i]}%</span></div>
        <div className="h-8 overflow-hidden rounded-lg bg-primary/10">{Array.from({ length: 24 }, (_, n) => <span key={n} className="mr-[2px] inline-block w-[3%] rounded-sm bg-primary/60" style={{ height: `${20 + ((n * 17 + i * 23) % 70)}%` }} />)}</div>
        <StudioSlider label="Level" value={levels[i]} onChange={(v) => setLevels((old) => old.map((x, n) => (n === i ? v : x)))} unit="%" />
      </div>)}</div>
      <StudioButton className="w-full" onClick={() => window.open(demucs.url, "_blank", "noopener,noreferrer")}>Open Demucs free stem separator</StudioButton>
    </Panel>
  );
}

export function StoryboardPanel() {
  const studio = useStudio();
  const [direction, setDirection] = useState("");
  const [scenes, setScenes] = useState(10);
  const [result, setResult] = useState("");
  const build = () => {
    const base = (direction || studio.direction || "cinematic performance with evolving visual motifs").trim();
    const text = Array.from({ length: scenes }, (_, i) => `### Scene ${i + 1}\n**Time:** ${i * 10}s\n**Shot:** ${i % 2 ? "moving medium shot" : "wide establishing shot"}\n**Action:** ${base}\n**Lighting:** cinematic crimson highlights\n**Video prompt:** ${base}; coherent continuity; polished music-video cinematography.`).join("\n\n");
    setResult(text);
    setStudio({ storyboard: text, direction: base });
  };
  return (
    <Panel eyebrow="Video prep" title="Automated Storyboarding" icon={<Clapperboard className="size-5" />}>
      <p className="text-sm text-muted-foreground">Build a complete shot list locally, then use it with the full-song video renderer.</p>
      <input value={studio.title} onChange={(e) => setStudio({ title: e.target.value })} placeholder="Track title" className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm" />
      <textarea value={direction || studio.direction} onChange={(e) => setDirection(e.target.value)} rows={4} placeholder="Visual direction..." className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm" />
      <StudioSlider label="Scenes" value={scenes} min={3} max={24} onChange={setScenes} />
      <StudioButton className="w-full" onClick={build}>Build storyboard locally</StudioButton>
      {result && <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 text-xs">{result}</pre>}
    </Panel>
  );
}

export function VideoPanel() {
  const studio = useStudio();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState("video/webm");

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const generate = async () => {
    if (!studio.audioUrl) { setStatus("Generate or upload the finished song first."); return; }
    setBusy(true); setStatus("Reading the finished song duration...");
    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }
    try {
      const audioBlob = await fetch(studio.audioUrl).then(async (response) => {
        if (!response.ok) throw new Error("The finished song could not be read.");
        return response.blob();
      });
      const probe = document.createElement("audio");
      probe.preload = "metadata";
      probe.src = URL.createObjectURL(audioBlob);
      await new Promise<void>((resolve, reject) => { probe.onloadedmetadata = () => resolve(); probe.onerror = () => reject(new Error("The finished song has no readable duration.")); });
      const duration = probe.duration;
      URL.revokeObjectURL(probe.src);
      if (!Number.isFinite(duration) || duration < 2) throw new Error("The finished song is too short to render.");
      let referenceImageBlob: Blob | null = null;
      if (studio.referenceUrl) { const response = await fetch(studio.referenceUrl); if (response.ok) referenceImageBlob = await response.blob(); }
      const result = await generateFullMusicVideo({
        audioBlob,
        audioDurationSeconds: duration,
        title: studio.title,
        direction: studio.direction,
        storyboard: studio.storyboard,
        referenceImageBlob,
        onProgress: (update) => setStatus(update.message),
      });
      setResultUrl(URL.createObjectURL(result.blob));
      setResultType(result.mimeType);
      setStatus(`Complete: ${result.chunkCount} generated scenes rendered across ${Math.round(result.durationSeconds)} seconds.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Music video generation failed.");
    } finally { setBusy(false); }
  };

  return (
    <Panel eyebrow="Video" title="Full Music Video Generator" icon={<Film className="size-5" />}>
      <p className="text-sm text-muted-foreground">Generate a complete scene-by-scene music video for the finished song. The final render uses the exact song audio, not audio invented by the video model.</p>
      <Note><Readout label="Song" value={studio.audioName || (studio.audioUrl ? "Ready" : "Not loaded")} /><Readout label="Visual reference" value={studio.referenceUrl ? "Loaded" : "Optional"} /><Readout label="Cost" value="Free/open engines" /></Note>
      {status && <p className="rounded-xl border border-border bg-background/50 p-3 text-xs">{status}</p>}
      {resultUrl && <div className="space-y-2 rounded-xl border border-border bg-background/50 p-3">
        <video controls playsInline src={resultUrl} className="w-full rounded-lg" />
        <StudioButton className="w-full" onClick={() => { const link = document.createElement("a"); link.href = resultUrl; link.download = `${(studio.title || "little-reds-music-video").replace(/[^a-z0-9-_]+/gi, "-")}.${resultType.includes("mp4") ? "mp4" : "webm"}`; link.click(); }}><Download className="mr-2 inline size-4" /> Download full music video</StudioButton>
      </div>}
      <StudioButton className="w-full" disabled={busy || !studio.audioUrl} onClick={() => void generate()}>{busy ? "Generating full music video…" : "Generate Full Music Video"}</StudioButton>
    </Panel>
  );
}
