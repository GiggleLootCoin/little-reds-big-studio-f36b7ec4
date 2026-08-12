import { runStudioJob, artifactText } from "./studio-runtime";
import { fileToDataUrl, type BuddyAttachment } from "./buddy-attachments";

export async function attachmentContext(attachments: BuddyAttachment[], setStatus?: (status: string) => void): Promise<string> {
  const parts: string[] = [];
  for (const attachment of attachments) {
    if (attachment.type.startsWith("audio/")) {
      try {
        setStatus?.(`Transcribing ${attachment.name}…`);
        const result = await runStudioJob("speech-to-text", { audio: attachment.file }, setStatus);
        const text = artifactText(result.value).trim();
        if (text) parts.push(`Audio transcript for ${attachment.name}:\n${text}`);
      } catch {
        parts.push(`Audio attachment supplied: ${attachment.name}. Automatic transcription was unavailable.`);
      }
    } else if (attachment.type.startsWith("text/") || attachment.type === "application/json" || attachment.type === "application/rtf") {
      try {
        const text = await attachment.file.text();
        if (text.trim()) parts.push(`Text from ${attachment.name}:\n${text.slice(0, 20000)}`);
      } catch {}
    }
  }
  return parts.join("\n\n");
}

export async function imageAttachmentParts(attachments: BuddyAttachment[]) {
  return await Promise.all(
    attachments
      .filter((attachment) => attachment.type.startsWith("image/"))
      .slice(0, 4)
      .map(async (attachment) => ({
        type: "image_url" as const,
        image_url: { url: await fileToDataUrl(attachment.file) },
      })),
  );
}
