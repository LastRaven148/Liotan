import { base64UrlToBytes, bytesToBase64Url, randomBytes, textDecoder, textEncoder } from "./encoding";

const DB_NAME = "liotan-local-crypto-v4";
const DB_VERSION = 1;
const wrappingKeyPromises = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error("Unable to open local crypto store"));
    request.onblocked = () => reject(new Error("Local crypto store is blocked by another tab"));
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);
      let value = null;
      request.onsuccess = () => { value = request.result ?? null; };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || request.error || new Error("IndexedDB read failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB read aborted"));
    });
  } finally {
    db.close();
  }
}

async function idbPut(storeName, key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB write failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB write aborted"));
    });
  } finally {
    db.close();
  }
}

async function idbAdd(storeName, key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).add(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB add failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB add aborted"));
    });
  } finally {
    db.close();
  }
}

async function loadOrCreateWrappingKey(username) {
  const keyId = `recovery-wrap:${username}`;
  let key = await idbGet("keys", keyId);
  if (key) return key;

  const candidate = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  try {
    await idbAdd("keys", keyId, candidate);
    return candidate;
  } catch (error) {
    if (error?.name !== "ConstraintError") throw error;
    key = await idbGet("keys", keyId);
    if (!key) throw new Error("Unable to load the winning recovery wrapping key");
    return key;
  }
}

function wrappingKey(username) {
  const keyId = String(username || "");
  if (!wrappingKeyPromises.has(keyId)) {
    wrappingKeyPromises.set(
      keyId,
      loadOrCreateWrappingKey(keyId).finally(() => wrappingKeyPromises.delete(keyId))
    );
  }
  return wrappingKeyPromises.get(keyId);
}

export function normalizeRecoveryKey(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, "");
  const bytes = base64UrlToBytes(normalized, 32);
  return { encoded: bytesToBase64Url(bytes), bytes };
}

export function createRecoveryKey() {
  return bytesToBase64Url(randomBytes(32));
}

export async function saveRecoveryKey(username, encodedRecoveryKey) {
  const { encoded, bytes } = normalizeRecoveryKey(encodedRecoveryKey);
  try {
    const key = await wrappingKey(username);
    const iv = randomBytes(12);
    const aad = textEncoder.encode(`liotan-recovery-wrap-v1:${username}`);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, bytes));
    await idbPut("records", `recovery:${username}`, {
      v: 1,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(ciphertext)
    });
    return encoded;
  } finally {
    bytes.fill(0);
  }
}

export async function loadRecoveryKey(username) {
  const record = await idbGet("records", `recovery:${username}`);
  if (!record || record.v !== 1) return "";
  const key = await wrappingKey(username);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64UrlToBytes(record.iv, 12),
    additionalData: textEncoder.encode(`liotan-recovery-wrap-v1:${username}`)
  }, key, base64UrlToBytes(record.ciphertext)));
  try {
    return bytesToBase64Url(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

export async function putEncryptedRecord(recordKey, value, cacheKey) {
  const iv = randomBytes(12);
  const aad = textEncoder.encode(`liotan-local-record-v1:${recordKey}`);
  const plaintext = textEncoder.encode(JSON.stringify(value));
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", cacheKey, "AES-GCM", false, ["encrypt"]);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, cryptoKey, plaintext);
    await idbPut("records", `secure:${recordKey}`, {
      v: 1,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
    });
  } finally {
    plaintext.fill(0);
  }
}

export async function getEncryptedRecord(recordKey, cacheKey) {
  const record = await idbGet("records", `secure:${recordKey}`);
  if (!record || record.v !== 1) return null;
  return decryptStoredRecord(recordKey, record, cacheKey);
}

async function decryptStoredRecord(recordKey, record, cacheKey) {
  const cryptoKey = await crypto.subtle.importKey("raw", cacheKey, "AES-GCM", false, ["decrypt"]);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64UrlToBytes(record.iv, 12),
    additionalData: textEncoder.encode(`liotan-local-record-v1:${recordKey}`)
  }, cryptoKey, base64UrlToBytes(record.ciphertext)));
  try {
    return JSON.parse(textDecoder.decode(plaintext));
  } finally {
    plaintext.fill(0);
  }
}

export async function listEncryptedRecords(prefix, cacheKey, limit = 100000) {
  const db = await openDb();
  let records;
  try {
    records = await new Promise((resolve, reject) => {
      const output = [];
      const transaction = db.transaction("records", "readonly");
      const range = IDBKeyRange.bound(`secure:${prefix}`, `secure:${prefix}\uffff`);
      const request = transaction.objectStore("records").openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || output.length >= limit) {
          resolve(output);
          return;
        }
        output.push({ key: String(cursor.key).slice("secure:".length), value: cursor.value });
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
  const output = [];
  for (const record of records) {
    try {
      output.push(await decryptStoredRecord(record.key, record.value, cacheKey));
    } catch {
      // A corrupt local cache record is isolated; MLS network state remains authoritative.
    }
  }
  return output;
}
