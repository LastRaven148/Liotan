import { base64UrlToBytes, bytesToBase64Url, randomBytes, textDecoder, textEncoder } from "./encoding";

const DB_NAME = "liotan-local-crypto-v4";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local crypto store"));
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(storeName, key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function wrappingKey(username) {
  const keyId = `recovery-wrap:${username}`;
  let key = await idbGet("keys", keyId);
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await idbPut("keys", keyId, key);
  }
  return key;
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
  const key = await wrappingKey(username);
  const iv = randomBytes(12);
  const aad = textEncoder.encode(`liotan-recovery-wrap-v1:${username}`);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, bytes));
  await idbPut("records", `recovery:${username}`, {
    v: 1,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(ciphertext)
  });
  bytes.fill(0);
  return encoded;
}

export async function loadRecoveryKey(username) {
  const record = await idbGet("records", `recovery:${username}`);
  if (!record || record.v !== 1) return "";
  const key = await wrappingKey(username);
  const plaintext = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64UrlToBytes(record.iv, 12),
    additionalData: textEncoder.encode(`liotan-recovery-wrap-v1:${username}`)
  }, key, base64UrlToBytes(record.ciphertext));
  return bytesToBase64Url(new Uint8Array(plaintext));
}

export async function putEncryptedRecord(recordKey, value, cacheKey) {
  const iv = randomBytes(12);
  const aad = textEncoder.encode(`liotan-local-record-v1:${recordKey}`);
  const plaintext = textEncoder.encode(JSON.stringify(value));
  const cryptoKey = await crypto.subtle.importKey("raw", cacheKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, cryptoKey, plaintext);
  await idbPut("records", `secure:${recordKey}`, {
    v: 1,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
  });
}

export async function getEncryptedRecord(recordKey, cacheKey) {
  const record = await idbGet("records", `secure:${recordKey}`);
  if (!record || record.v !== 1) return null;
  return decryptStoredRecord(recordKey, record, cacheKey);
}

async function decryptStoredRecord(recordKey, record, cacheKey) {
  const cryptoKey = await crypto.subtle.importKey("raw", cacheKey, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64UrlToBytes(record.iv, 12),
    additionalData: textEncoder.encode(`liotan-local-record-v1:${recordKey}`)
  }, cryptoKey, base64UrlToBytes(record.ciphertext));
  return JSON.parse(textDecoder.decode(plaintext));
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
