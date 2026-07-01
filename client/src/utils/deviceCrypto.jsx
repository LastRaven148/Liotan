const DEVICE_DB_NAME = "liotan-device-crypto-v2";
const DEVICE_DB_VERSION = 1;
const DEVICE_STORE = "device-keys";
const DEVICE_KEY_PAIR_KEY = "current-device-key";
const LEGACY_DEVICE_KEY_PAIR_KEY = "liotan_device_key_pair_v1";

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBuffer(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized.padEnd(
    normalized.length + ((4 - normalized.length % 4) % 4),
    "="
  );

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function openDeviceDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DEVICE_DB_NAME, DEVICE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_STORE)) {
        db.createObjectStore(DEVICE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}

async function idbGet(key) {
  const db = await openDeviceDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_STORE, "readonly");
    const request = tx.objectStore(DEVICE_STORE).get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("IndexedDB get failed"));
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key, value) {
  const db = await openDeviceDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_STORE, "readwrite");
    tx.objectStore(DEVICE_STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("IndexedDB set failed"));
    };
  });
}

async function idbDelete(key) {
  const db = await openDeviceDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_STORE, "readwrite");
    tx.objectStore(DEVICE_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("IndexedDB delete failed"));
    };
  });
}

async function exportPublicKey(key) {
  return crypto.subtle.exportKey("jwk", key);
}

async function importPrivateKey(jwk, extractable = false) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    extractable,
    ["deriveKey", "deriveBits"]
  );
}

async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    []
  );
}

async function createPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    false,
    ["deriveKey", "deriveBits"]
  );

  const publicKey = await exportPublicKey(pair.publicKey);
  const stored = {
    publicKey,
    privateKey: pair.privateKey,
    createdAt: new Date().toISOString()
  };

  await idbSet(DEVICE_KEY_PAIR_KEY, stored);

  return stored;
}

async function loadLegacyPair() {
  try {
    const raw = localStorage.getItem(LEGACY_DEVICE_KEY_PAIR_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (parsed?.publicKey?.kty !== "EC" || parsed?.privateKey?.kty !== "EC") {
      return null;
    }

    const privateKey = await importPrivateKey(parsed.privateKey, false);
    const stored = {
      publicKey: parsed.publicKey,
      privateKey,
      createdAt: parsed.createdAt || new Date().toISOString(),
      migratedAt: new Date().toISOString()
    };

    await idbSet(DEVICE_KEY_PAIR_KEY, stored);
    localStorage.removeItem(LEGACY_DEVICE_KEY_PAIR_KEY);

    return stored;
  } catch {
    try {
      localStorage.removeItem(LEGACY_DEVICE_KEY_PAIR_KEY);
    } catch {}
    return null;
  }
}

async function getStoredPair() {
  const stored = await idbGet(DEVICE_KEY_PAIR_KEY);

  if (stored?.publicKey?.kty === "EC" && stored?.privateKey) {
    return stored;
  }

  return loadLegacyPair();
}

export async function getDevicePublicKey() {
  const pair = await getStoredPair() || await createPair();
  return pair.publicKey;
}

export async function resetDeviceKeyPair() {
  await idbDelete(DEVICE_KEY_PAIR_KEY);
  try {
    localStorage.removeItem(LEGACY_DEVICE_KEY_PAIR_KEY);
  } catch {}

  return createPair();
}

export async function getDeviceKeyFingerprint() {
  const publicKey = await getDevicePublicKey();

  const encoded = new TextEncoder().encode(JSON.stringify({
    crv: publicKey.crv,
    kty: publicKey.kty,
    x: publicKey.x,
    y: publicKey.y
  }));

  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return bufferToBase64Url(digest).slice(0, 24);
}

export async function getDevicePrivateKey() {
  const pair = await getStoredPair() || await createPair();
  return pair.privateKey;
}

export async function importDevicePublicKey(publicKey) {
  return importPublicKey(publicKey);
}

export {
  bufferToBase64Url,
  base64UrlToBuffer
};
