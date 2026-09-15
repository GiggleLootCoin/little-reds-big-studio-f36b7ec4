export type LocalArtifact = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  blob: Blob;
};

const DB_NAME = "little-reds-big-studio-media";
const STORE_NAME = "artifacts";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open local media storage."));
  });
}

export async function saveLocalArtifact(
  blob: Blob,
  name: string,
  id = crypto.randomUUID(),
): Promise<LocalArtifact> {
  if (!blob.size) throw new Error("Cannot save an empty media artifact.");
  const artifact: LocalArtifact = {
    id,
    name,
    type: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt: new Date().toISOString(),
    blob,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(artifact);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to save media artifact."));
  });
  return artifact;
}

export async function getLocalArtifact(id: string): Promise<LocalArtifact | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as LocalArtifact | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Unable to read media artifact."));
  });
}

export async function listLocalArtifacts(): Promise<LocalArtifact[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as LocalArtifact[]).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      );
    request.onerror = () => reject(request.error ?? new Error("Unable to list media artifacts."));
  });
}

export async function deleteLocalArtifact(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to delete media artifact."));
  });
}
