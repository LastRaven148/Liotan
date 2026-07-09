const DB_NAME =
  "liotan-offline-media-v2";

const STORE_NAME =
  "encrypted-media";

export function openMediaDb() {
  return new Promise((resolve, reject) => {
    const request =
      indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded =
      () => {
        const db =
          request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

    request.onsuccess =
      () => resolve(request.result);

    request.onerror =
      () => reject(request.error);
  });
}

export async function getOfflineBlob(key) {
  const db =
    await openMediaDb();

  return new Promise((resolve, reject) => {
    const tx =
      db.transaction(STORE_NAME, "readonly");

    const store =
      tx.objectStore(STORE_NAME);

    const request =
      store.get(key);

    request.onsuccess =
      () => resolve(request.result || null);

    request.onerror =
      () => reject(request.error);
  });
}

export async function saveOfflineBlob(key, blob) {
  const db =
    await openMediaDb();

  return new Promise((resolve, reject) => {
    const tx =
      db.transaction(STORE_NAME, "readwrite");

    const store =
      tx.objectStore(STORE_NAME);

    store.put(blob, key);

    tx.oncomplete =
      () => resolve();

    tx.onerror =
      () => reject(tx.error);
  });
}