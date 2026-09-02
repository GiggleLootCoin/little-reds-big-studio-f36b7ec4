import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { useEntitlement } from "@/hooks/use-entitlement";
import { StudioButton } from "./ui";

type ExportKind = "audio" | "image" | "video";

type VideoWithCaptureStream = HTMLVideoElement & {
  captureStream: () => MediaStream;
};

function reviewFor(kind: ExportKind) {
  const checks = [
    "Confirm you have the rights or permission for every uploaded source, voice, lyric, sample, and reference used.",
    "Check the AI provider's output/license terms before commercial use or redistribution.",
  ];
  if (kind === "video")
    checks.push(
      "Before publishing, check the destination platform's current rules for AI-generated, altered, or reused content and music rights.",
    );
  if (kind === "audio")
    checks.push(
      "Listen once for unintended artifacts, copyrighted material, or a voice attribution issue before publishing.",
    );
  return checks;
}

async function watermarkImage(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not prepare the image for export.");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser.");
  ctx.drawImage(bitmap, 0, 0);
  const size = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
  ctx.font = `600 ${size}px sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(
    12,
    canvas.height - size - 18,
    ctx.measureText("Little Red's Big Studio").width + 20,
    size + 12,
  );
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.fillText("Little Red's Big Studio", 22, canvas.height - 14);
  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Could not encode the watermarked image.")),
      "image/png",
    ),
  );
}

async function watermarkVideo(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not prepare the video for export.");
  const source = URL.createObjectURL(await response.blob());
  const video = document.createElement("video") as VideoWithCaptureStream;
  video.src = source;
  video.muted = false;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () =>
      reject(new Error("This browser could not decode the video for watermarking."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Video export is unavailable in this browser.");
  const stream = canvas.captureStream(30);
  const sourceStream = video.captureStream();
  sourceStream.getAudioTracks().forEach((track: MediaStreamTrack) => stream.addTrack(track));
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("Video watermark export failed."));
  });
  const frame = () => {
    if (video.ended) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const size = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
    ctx.font = `600 ${size}px sans-serif`;
    const label = "Little Red's Big Studio";
    const width = ctx.measureText(label).width + 20;
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(12, canvas.height - size - 18, width, size + 12);
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.fillText(label, 22, canvas.height - 14);
    requestAnimationFrame(frame);
  };
  video.onended = () => recorder.stop();
  recorder.start();
  await video.play();
  frame();
  const result = await done;
  URL.revokeObjectURL(source);
  return result;
}

export function CreatorExportButton({
  kind,
  url,
  title,
}: {
  kind: ExportKind;
  url: string;
  title: string;
}) {
  const { unlimited } = useEntitlement();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const exportNow = async () => {
    setBusy(true);
    setMessage("");
    try {
      let blob: Blob | null = null;
      if (!unlimited && kind === "image") blob = await watermarkImage(url);
      if (!unlimited && kind === "video") blob = await watermarkVideo(url);
      const href = blob ? URL.createObjectURL(blob) : url;
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "lrbgs-export"}.${kind === "image" ? "png" : kind === "video" ? "webm" : "mp3"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (blob) setTimeout(() => URL.revokeObjectURL(href), 10000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  if (reviewOpen)
    return (
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-primary" /> Creator export review
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {reviewFor(kind).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <StudioButton className="text-xs" disabled={busy} onClick={() => void exportNow()}>
            <Download className="size-3" />{" "}
            {busy ? "Preparing…" : unlimited ? "Export" : "Export with free watermark"}
          </StudioButton>
          <StudioButton
            variant="ghost"
            className="text-xs"
            disabled={busy}
            onClick={() => setReviewOpen(false)}
          >
            Cancel
          </StudioButton>
        </div>
        {message ? <p className="mt-2 text-destructive">{message}</p> : null}
      </div>
    );

  return (
    <StudioButton variant="ghost" className="text-xs" onClick={() => setReviewOpen(true)}>
      <Download className="size-3" /> Save / review
    </StudioButton>
  );
}
