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
      isDefault: device.deviceId === "default" || /default/i.test(device.label),
    }));
}

export function chooseMicrophone(devices: MicrophoneInfo[], preferredId?: string): MicrophoneInfo | null {
  if (!devices.length) return null;
  if (preferredId) {
    const preferred = devices.find((device) => device.id === preferredId);
    if (preferred) return preferred;
  }
  // The browser's default is the safest first choice because it is the input
  // the OS has already selected (including Bluetooth/wired routing on phones).
  return devices.find((device) => device.isDefault) ?? devices[0] ?? null;
}

export async function requestMicrophone(deviceId?: string): Promise<MediaStream> {
  if (typeof window === "undefined" || !window.isSecureContext) {
    throw new Error("Microphone access requires a secure HTTPS page.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not provide microphone access.");
  }

  const exact = deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {};
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...exact,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

/**
 * Test a candidate input without stealing the active call stream. This is
 * deliberately best-effort: browsers may expose only a default device until
 * permission has been granted, and Bluetooth routes can disappear while a
 * call is active.
 */
export async function probeMicrophone(deviceId?: string): Promise<boolean> {
  try {
    const stream = await requestMicrophone(deviceId);
    const track = stream.getAudioTracks()[0];
    const usable = Boolean(track && track.readyState === "live" && track.enabled);
    stopMicrophone(stream);
    return usable;
  } catch {
    return false;
  }
}

export function classifyMicrophoneError(error: unknown): MicrophoneErrorKind {
  const name = error instanceof DOMException ? error.name : "";
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (name === "NotAllowedError" || name === "SecurityError" || message.includes("permission"))
    return "permission";
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure-context";
  if (
    name === "NotFoundError" ||
    name === "OverconstrainedError" ||
    message.includes("no microphone")
  )
    return "no-device";
  if (name === "NotSupportedError" || message.includes("not supported")) return "unsupported";
  return "unknown";
}

export function describeMicrophoneError(error: unknown): string {
  switch (classifyMicrophoneError(error)) {
    case "permission":
      return "Microphone permission was denied. Allow microphone access for this site, then tap Live Chat again.";
    case "insecure-context":
      return "Microphone access requires the secure Studio address (HTTPS).";
    case "no-device":
      return "No usable microphone was found. Check the phone, headset or Bluetooth input and try again.";
    case "unsupported":
      return "This browser does not support the microphone feature Buddy needs.";
    default:
      return "Buddy could not open a microphone. Check the selected input and try again.";
  }
}

export function stopMicrophone(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
