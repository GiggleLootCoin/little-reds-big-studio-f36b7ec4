export type BuddyAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  file: File;
};

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPT = [
  "image/*",
  "audio/*",
  "video/*",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/rtf",
];

export const buddyAccept = ACCEPT.join(",");

export function acceptBuddyFile(file: File): BuddyAttachment {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`${file.name} is too large. Buddy accepts files up to 12 MB here.`);
  }
  if (!isSupported(file)) {
    throw new Error(`${file.name} is not a supported Buddy attachment.`);
  }
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    url: URL.createObjectURL(file),
    file,
  };
}

export function isSupported(file: File) {
  return ACCEPT.some((pattern) => {
    if (pattern.endsWith("/*")) return file.type.startsWith(pattern.slice(0, -1));
    return file.type === pattern;
  });
}

export function revokeBuddyAttachment(attachment: BuddyAttachment) {
  URL.revokeObjectURL(attachment.url);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read attachment."));
    reader.readAsDataURL(file);
  });
}

export function attachmentSummary(attachment: BuddyAttachment) {
  const size =
    attachment.size < 1024 * 1024
      ? `${Math.max(1, Math.round(attachment.size / 1024))} KB`
      : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`;
  return `${attachment.name} (${size})`;
}
