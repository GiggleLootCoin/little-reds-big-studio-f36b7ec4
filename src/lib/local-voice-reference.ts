const DB_NAME = "little-reds-big-studio";
const STORE = "voice-profile";
const SAMPLE_KEY = "buddy-voice-sample";

function openVoiceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable on this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local voice storage."));
  });
}

async function normalizeReferenceAudio(blob: Blob): Promise<Blob> {
  if (
    typeof window === "undefined" ||
    typeof AudioContext === "undefined" ||
    /^audio\/(wav|wave|x-wav)$/i.test(blob.type)
  ) {
    return blob;
  }

  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Math.min(buffer.numberOfChannels, 2);
    const samples = new Float32Array(buffer.length);
    for (let channel = 0; channel < channels; channel += 1) {
      const source = buffer.getChannelData(channel);
      for (let i = 0; i < buffer.length; i += 1) samples[i] += source[i] / channels;
    }
    const pcm = new Int16Array(buffer.length);
    for (let i = 0; i < pcm.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    const wav = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(wav);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    new Uint8Array(wav, 44).set(new Uint8Array(pcm.buffer));
    return new Blob([wav], { type: "audio/wav" });
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function saveLocalBuddyVoiceReference(blob: Blob): Promise<void> {
  if (!blob.size) throw new Error("The voice recording is empty.");
  const normalized = await normalizeReferenceAudio(blob);
  const db = await openVoiceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(normalized, SAMPLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not save the local voice reference."));
  });
  db.close();
}
