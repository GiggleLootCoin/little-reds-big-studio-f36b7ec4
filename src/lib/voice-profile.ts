const DB_NAME = "little-reds-big-studio";
const STORE = "voice-profile";
const KEY = "buddy-voice-sample";
const TRANSCRIPT_KEY = "buddy-voice-transcript";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const value = await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function saveVoiceSample(blob: Blob, transcript = ""): Promise<void> {
  await put(KEY, blob);
  await put(TRANSCRIPT_KEY, transcript.trim());
}

export async function getVoiceSample(): Promise<Blob | null> {
  const value = await get<Blob>(KEY);
  return value instanceof Blob ? value : null;
}

export async function saveVoiceTranscript(transcript: string): Promise<void> {
  await put(TRANSCRIPT_KEY, transcript.trim());
}

export async function getVoiceTranscript(): Promise<string> {
  return (await get<string>(TRANSCRIPT_KEY))?.trim() || "";
}

export async function clearVoiceSample(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.delete(KEY);
      store.delete(TRANSCRIPT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best effort */
  }
}
