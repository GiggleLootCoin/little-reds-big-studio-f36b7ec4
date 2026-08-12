export type MicrophoneErrorKind =
  "permission" | "insecure-context" | "no-device" | "unsupported" | "unknown";

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

export function chooseMicrophone(devices: MicrophoneInfo[]): MicrophoneInfo | null {
  if (!devices.length) return null;
  return devices.find((device) => !device.isDefault) ?? devices[0] ?? null;
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

export function classifyMicrophoneError(error: unknown): MicrophoneErrorKind {
  const name = error instanceof DOMException ? error.name : "";
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (name === "NotAllowedError" || name === "SecurityError" || message.includes("permission"))
    return "permission";
  if (!window.isSecureContext) return "insecure-context";
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
