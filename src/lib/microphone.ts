export type MicrophoneErrorKind =
  | "permission"
  | "insecure-context"
  | "no-device"
  | "unsupported"
  | "unknown";

export type MicrophoneInfo = {
  id: string;
  label: string;
  isDefault: boolean;
};

export async function listMicrophones(): Promise<MicrophoneInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      id: device.deviceId || "default",
      label: device.label || `Microphone ${index + 1}`,
      isDefault: device.deviceId === "default" || /default|phone|built.?in/i.test(device.label),
    }));
}

export function chooseMicrophone(devices: MicrophoneInfo[], preferredId?: string) {
  if (!devices.length) return null;
  if (preferredId) return devices.find((device) => device.id === preferredId) ?? null;
  return devices.find((device) => device.id === "default") ??
    devices.find((device) => device.isDefault) ??
    devices[0] ??
    null;
}

export async function requestMicrophone(deviceId?: string): Promise<MediaStream> {
  if (typeof window === "undefined" || !window.isSecureContext)
    throw new Error("Microphone access requires a secure HTTPS page.");
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("This browser does not provide microphone access.");

  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };

  // IMPORTANT: on Android Chrome the literal `default` device is the phone's
  // current OS-selected input. Do not turn an absent/hidden deviceId into an
  // arbitrary physical input; doing so is what made Buddy appear to require a
  // plugged-in microphone.
  const constraints: MediaTrackConstraints = { ...base };
  if (deviceId && deviceId !== "default") constraints.deviceId = { exact: deviceId };

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
  } catch (error) {
    // If a remembered Bluetooth/headset id is stale, immediately fall back to
    // Android's current default input (normally the built-in phone microphone).
    if (deviceId && deviceId !== "default")
      return navigator.mediaDevices.getUserMedia({ audio: base, video: false });
    throw error;
  }
}

export async function probeMicrophone(deviceId?: string): Promise<boolean> {
  try {
    const stream = await requestMicrophone(deviceId);
    const track = stream.getAudioTracks()[0];
    const usable = Boolean(track?.enabled && track?.readyState === "live");
    stopMicrophone(stream);
    return usable;
  } catch {
    return false;
  }
}

export function classifyMicrophoneError(error: unknown): MicrophoneErrorKind {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (name === "NotAllowedError" || name === "SecurityError" || message.includes("permission")) return "permission";
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure-context";
  if (name === "NotFoundError" || name === "OverconstrainedError" || message.includes("no microphone")) return "no-device";
  if (name === "NotSupportedError" || message.includes("not supported")) return "unsupported";
  return "unknown";
}

export function describeMicrophoneError(error: unknown): string {
  switch (classifyMicrophoneError(error)) {
    case "permission":
      return "Microphone permission was denied. Allow microphone access for this site, then try Buddy again.";
    case "insecure-context":
      return "Microphone access requires the secure Studio address (HTTPS).";
    case "no-device":
      return "No usable microphone was found. Check Android microphone permission and try again.";
    case "unsupported":
      return "This browser does not support Buddy's microphone feature.";
    default:
      return "Buddy could not open the phone microphone. Check the site's microphone permission and try again.";
  }
}

export function stopMicrophone(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
