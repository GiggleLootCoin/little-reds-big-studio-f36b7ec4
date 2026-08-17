import { createLocalChatterboxClone } from "./local-chatterbox";

const VERIFY_TEXT =
  "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";

export async function verifyBuddyReferenceLocally(
  reference: Blob,
): Promise<{ blob: Blob; provider: string }> {
  const result = await createLocalChatterboxClone(reference, VERIFY_TEXT, 0.5);
  const response = await fetch(result.url);
  const blob = await response.blob();
  URL.revokeObjectURL(result.url);
  if (blob.size < 4096) {
    throw new Error("Local Chatterbox returned an empty voice verification sample.");
  }
  return { blob, provider: result.provider };
}
