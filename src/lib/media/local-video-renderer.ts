export type LocalVideoRenderOptions = {
  imageBlob: Blob;
  durationSeconds: number;
  audioBlob?: Blob | null;
  title?: string;
};

function chooseMimeType(): string {
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type)) || "video/webm";
}

function waitFor(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { target.removeEventListener(event, ok); target.removeEventListener("error", fail); resolve(); };
    const fail = () => { target.removeEventListener(event, ok); target.removeEventListener("error", fail); reject(new Error("The browser could not decode the media source.")); };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

export async function renderLocalCinematicVideo(options: LocalVideoRenderOptions): Promise<Blob> {
  if (!options.imageBlob.size) throw new Error("A real image is required for local video rendering.");
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) throw new Error("A positive video duration is required.");
  if (!HTMLCanvasElement.prototype.captureStream || typeof MediaRecorder === "undefined") throw new Error("This browser does not support local video rendering.");

  const image = new Image();
  image.decoding = "async";
  const imageUrl = URL.createObjectURL(options.imageBlob);
  image.src = imageUrl;
  await waitFor(image, "load");

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) { URL.revokeObjectURL(imageUrl); throw new Error("The browser could not create the video canvas."); }

  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) { URL.revokeObjectURL(imageUrl); throw new Error("This browser does not support the local audio renderer."); }
  const audioContext = new AudioContextCtor();
  const destination = audioContext.createMediaStreamDestination();
  let source: AudioBufferSourceNode | null = null;
  let silentOscillator: OscillatorNode | null = null;

  if (options.audioBlob?.size) {
    const buffer = await audioContext.decodeAudioData((await options.audioBlob.arrayBuffer()).slice(0));
    source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
  } else {
    silentOscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    silentOscillator.connect(gain).connect(destination);
  }

  const stream = canvas.captureStream(30);
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  const mimeType = chooseMimeType();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("The local video recorder failed."));
  });

  const started = performance.now();
  recorder.start(1000);
  await audioContext.resume();
  if (source) source.start(0); else silentOscillator?.start(0);

  const draw = () => {
    const elapsed = (performance.now() - started) / 1000;
    const progress = Math.min(1, elapsed / options.durationSeconds);
    const zoom = 1.04 + progress * 0.08;
    const panX = Math.sin(progress * Math.PI * 2) * canvas.width * 0.025;
    const panY = Math.cos(progress * Math.PI) * canvas.height * 0.018;
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.fillStyle = "#050505";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2 + panX, (canvas.height - height) / 2 + panY, width, height);
    const vignette = context.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.2, canvas.width / 2, canvas.height / 2, canvas.height * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.48)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (options.title?.trim()) {
      context.font = "600 28px sans-serif";
      context.fillStyle = "rgba(255,255,255,0.82)";
      context.fillText(options.title.trim().slice(0, 80), 52, canvas.height - 52);
    }
    if (elapsed < options.durationSeconds) requestAnimationFrame(draw);
  };
  draw();
  await new Promise<void>((resolve) => window.setTimeout(resolve, options.durationSeconds * 1000 + 250));
  recorder.stop();
  try { source?.stop(); } catch {}
  try { silentOscillator?.stop(); } catch {}
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();
  URL.revokeObjectURL(imageUrl);

  const blob = new Blob(chunks, { type: mimeType });
  if (!blob.size || !blob.type.startsWith("video/")) throw new Error("Local video rendering returned an invalid artifact.");
  return blob;
}
