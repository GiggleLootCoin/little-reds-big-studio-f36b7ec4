export type BuddyAwarenessCapabilities = {
  camera: boolean;
  screen: boolean;
};

type AwarenessEnvironment = {
  mediaDevices?: { getUserMedia?: unknown } | null;
  getDisplayMedia?: unknown;
};

export function getBuddyAwarenessCapabilities(
  environment: AwarenessEnvironment =
    typeof navigator !== "undefined"
      ? {
          mediaDevices: navigator.mediaDevices,
          getDisplayMedia: navigator.mediaDevices?.getDisplayMedia,
        }
      : {},
): BuddyAwarenessCapabilities {
  return {
    camera: typeof environment.mediaDevices?.getUserMedia === "function",
    screen: typeof environment.getDisplayMedia === "function",
  };
}

export async function captureBuddyCameraFrame(): Promise<File> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
    throw new Error("Camera awareness is not supported on this device.");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("No camera stream was provided.");
    const settings = track.getSettings();
    const width = settings.width || 1280;
    const height = settings.height || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The camera frame could not be rendered.");
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob?.size) throw new Error("The camera returned an empty frame.");
    return new File([blob], `buddy-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export async function captureBuddyScreenFrame(): Promise<File> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia)
    throw new Error("Screen awareness is not supported on this device.");

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("No screen stream was provided.");
    const settings = track.getSettings();
    const width = settings.width || 1280;
    const height = settings.height || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The screen frame could not be rendered.");
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob?.size) throw new Error("The screen returned an empty frame.");
    return new File([blob], `buddy-screen-${Date.now()}.jpg`, { type: "image/jpeg" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
