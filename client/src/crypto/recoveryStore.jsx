import { base64UrlToBytes, bytesToBase64Url, randomBytes, textDecoder, textEncoder } from "./encoding";

const DB_NAME = "liotan-local-crypto-v4";
const DB_VERSION = 2;
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
      if (!db.objectStoreNames.contains("history")) {
        const history = db.createObjectStore("history");
        history.createIndex("byConversationSequence", ["conversationId", "sequence"], { unique: true });
        history.createIndex("byConversationMessage", ["conversationId", "clientMessageId"], { unique: false });
      }
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

async function idbPutMany(storeName, entries) {
  if (!entries.length) return;
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      for (const entry of entries) store.put(entry.value, entry.key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB batch write failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB batch write aborted"));
    });
  } finally {
    db.close();
  }
}

async function idbReadPrefixPage(storeName, prefix, afterKey = "", limit = 64) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const output = [];
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const lower = afterKey || prefix;
      const range = IDBKeyRange.bound(lower, `${prefix}\uffff`, Boolean(afterKey), false);
      const request = store.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || output.length >= limit) {
          resolve({ entries: output, lastKey: output.at(-1)?.key || "" });
          return;
        }
        output.push({ key: String(cursor.key), value: cursor.value });
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error("IndexedDB prefix read failed"));
    });
  } finally {
    db.close();
  }
}

async function idbDeletePrefix(storeName, prefix) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
      const request = store.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error || new Error("IndexedDB prefix delete failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB prefix delete aborted"));
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

async function encryptStoredRecord(recordKey, value, cryptoKey) {
  const iv = randomBytes(12);
  const aad = textEncoder.encode(`liotan-local-record-v1:${recordKey}`);
  const plaintext = textEncoder.encode(JSON.stringify(value));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, cryptoKey, plaintext);
    return {
      key: `secure:${recordKey}`,
      value: {
        v: 1,
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
      }
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function putEncryptedRecords(entries, cacheKey, options = {}) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  const batchSize = Math.max(8, Math.min(Number(options.batchSize) || 64, 128));
  const keyCopy = new Uint8Array(cacheKey);
  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey("raw", keyCopy, "AES-GCM", false, ["encrypt"]);
  } finally {
    keyCopy.fill(0);
  }
  let written = 0;
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batch = entries.slice(offset, offset + batchSize);
    const encrypted = await Promise.all(batch.map(entry =>
      encryptStoredRecord(String(entry.recordKey || ""), entry.value, cryptoKey)
    ));
    await idbPutMany("records", encrypted);
    written += encrypted.length;
    if (offset + batch.length < entries.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return written;
}

export async function putEncryptedRecord(recordKey, value, cacheKey) {
  await putEncryptedRecords([{ recordKey, value }], cacheKey, { batchSize: 8 });
}

export async function getEncryptedRecord(recordKey, cacheKey) {
  const record = await idbGet("records", `secure:${recordKey}`);
  if (!record || record.v !== 1) return null;
  return decryptStoredRecord(recordKey, record, cacheKey);
}

async function decryptStoredRecord(recordKey, record, cacheKey) {
  const cryptoKey = await crypto.subtle.importKey("raw", cacheKey, "AES-GCM", false, ["decrypt"]);
  return decryptStoredRecordWithKey(recordKey, record, cryptoKey);
}

async function decryptStoredRecordWithKey(recordKey, record, cryptoKey) {
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

function normalizeHistoryMeta({ conversationId, sequence, clientMessageId }) {
  const safeConversationId = String(conversationId || "");
  const safeSequence = Number(sequence);
  const safeClientMessageId = String(clientMessageId || "");
  if (!safeConversationId || !Number.isSafeInteger(safeSequence) || safeSequence <= 0 || !safeClientMessageId) {
    throw new Error("Invalid encrypted history metadata");
  }
  return {
    conversationId: safeConversationId,
    sequence: safeSequence,
    clientMessageId: safeClientMessageId,
    id: `${safeConversationId}:${String(safeSequence).padStart(16, "0")}:${safeClientMessageId}`
  };
}

async function decryptHistoryRecord(record, cacheKey) {
  const cryptoKey = await crypto.subtle.importKey("raw", cacheKey, "AES-GCM", false, ["decrypt"]);
  if (record.source === "records-v1" && record.legacyRecordKey) {
    return decryptStoredRecordWithKey(record.legacyRecordKey, record, cryptoKey);
  }
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64UrlToBytes(record.iv, 12),
    additionalData: textEncoder.encode(`liotan-local-history-v1:${record.id}`)
  }, cryptoKey, base64UrlToBytes(record.ciphertext)));
  try {
    return JSON.parse(textDecoder.decode(plaintext));
  } finally {
    plaintext.fill(0);
  }
}

async function encryptHistoryRecord(meta, value, cryptoKey) {
  const normalized = normalizeHistoryMeta(meta);
  const iv = randomBytes(12);
  const plaintext = textEncoder.encode(JSON.stringify(value));
  try {
    const ciphertext = await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv,
      additionalData: textEncoder.encode(`liotan-local-history-v1:${normalized.id}`)
    }, cryptoKey, plaintext);
    return {
      key: normalized.id,
      value: {
        ...normalized,
        v: 1,
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
      }
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function putEncryptedHistoryRecords(entries, cacheKey, options = {}) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  const batchSize = Math.max(8, Math.min(Number(options.batchSize) || 64, 128));
  const keyCopy = new Uint8Array(cacheKey);
  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey("raw", keyCopy, "AES-GCM", false, ["encrypt"]);
  } finally {
    keyCopy.fill(0);
  }
  let written = 0;
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    if (options.shouldContinue && !options.shouldContinue()) break;
    const batch = entries.slice(offset, offset + batchSize);
    const encrypted = await Promise.all(batch.map(entry =>
      encryptHistoryRecord(entry.meta, entry.value, cryptoKey)
    ));
    if (options.shouldContinue && !options.shouldContinue()) break;
    await idbPutMany("history", encrypted);
    written += encrypted.length;
    if (offset + batch.length < entries.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return written;
}

export async function putEncryptedHistoryRecord(meta, value, cacheKey) {
  await putEncryptedHistoryRecords([{ meta, value }], cacheKey, { batchSize: 8 });
}

export async function migrateEncryptedHistoryRecords(conversationId, cacheKey, options = {}) {
  const safeConversationId = String(conversationId || "");
  if (!safeConversationId) return { completed: true, written: 0, latest: [] };
  const batchSize = Math.max(8, Math.min(Number(options.batchSize) || 64, 128));
  const legacyPrefix = `secure:message:${safeConversationId}:`;
  const keyCopy = new Uint8Array(cacheKey);
  let decryptKey;
  try {
    decryptKey = await crypto.subtle.importKey("raw", keyCopy, "AES-GCM", false, ["decrypt"]);
  } finally {
    keyCopy.fill(0);
  }
  let afterKey = "";
  let written = 0;
  let completed = true;
  const latest = [];

  while (true) {
    if (options.shouldContinue && !options.shouldContinue()) {
      completed = false;
      break;
    }
    const page = await idbReadPrefixPage("records", legacyPrefix, afterKey, batchSize);
    if (!page.entries.length) break;
    const decoded = await Promise.all(page.entries.map(async entry => {
      try {
        const recordKey = entry.key.slice("secure:".length);
        return await decryptStoredRecordWithKey(recordKey, entry.value, decryptKey);
      } catch {
        return null;
      }
    }));
    const migrationEntries = [];
    for (let index = 0; index < decoded.length; index += 1) {
      const record = decoded[index];
      const sequence = Number(record?.sequence);
      const clientMessageId = String(record?.envelope?.clientMessageId || "");
      if (!clientMessageId || !Number.isSafeInteger(sequence) || sequence <= 0) continue;
      const meta = normalizeHistoryMeta({ conversationId: safeConversationId, sequence, clientMessageId });
      const legacy = page.entries[index];
      migrationEntries.push({
        key: meta.id,
        value: {
          ...meta,
          ...legacy.value,
          source: "records-v1",
          legacyRecordKey: legacy.key.slice("secure:".length)
        }
      });
      latest.push(record);
    }
    if (migrationEntries.length) {
      if (options.shouldContinue && !options.shouldContinue()) {
        completed = false;
        break;
      }
      await idbPutMany("history", migrationEntries);
      written += migrationEntries.length;
    }
    latest.sort((left, right) => Number(left?.sequence || 0) - Number(right?.sequence || 0));
    if (latest.length > 80) latest.splice(0, latest.length - 80);
    afterKey = page.lastKey;
    if (page.entries.length < batchSize) break;
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  if (completed && (!options.shouldContinue || options.shouldContinue())) {
    await idbDeletePrefix("records", legacyPrefix);
  } else {
    completed = false;
  }
  return { completed, written, latest };
}

export async function listEncryptedHistoryRecords(conversationId, cacheKey, options = {}) {
  const safeConversationId = String(conversationId || "");
  if (!safeConversationId) return [];
  const limit = Math.max(1, Math.min(Number(options.limit) || 80, 200));
  const beforeSequence = Number.isSafeInteger(Number(options.beforeSequence))
    ? Number(options.beforeSequence)
    : null;
  const afterSequence = Number.isSafeInteger(Number(options.afterSequence))
    ? Number(options.afterSequence)
    : null;
  const direction = beforeSequence !== null || afterSequence === null ? "prev" : "next";
  const lower = afterSequence !== null ? afterSequence : 0;
  const upper = beforeSequence !== null ? beforeSequence : Number.MAX_SAFE_INTEGER;
  const lowerOpen = afterSequence !== null;
  const upperOpen = beforeSequence !== null;
  const db = await openDb();
  let records;
  try {
    records = await new Promise((resolve, reject) => {
      const output = [];
      const transaction = db.transaction("history", "readonly");
      const index = transaction.objectStore("history").index("byConversationSequence");
      const range = IDBKeyRange.bound(
        [safeConversationId, lower],
        [safeConversationId, upper],
        lowerOpen,
        upperOpen
      );
      const request = index.openCursor(range, direction);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || output.length >= limit) {
          resolve(output);
          return;
        }
        output.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error("Encrypted history cursor failed"));
    });
  } finally {
    db.close();
  }
  const output = [];
  for (const record of records) {
    try {
      output.push(await decryptHistoryRecord(record, cacheKey));
    } catch {
      // Isolate a corrupt page entry without discarding the MLS database.
    }
  }
  return output.sort((left, right) => Number(left?.sequence || 0) - Number(right?.sequence || 0));
}

export async function getEncryptedHistoryRecord(conversationId, clientMessageId, cacheKey) {
  const safeConversationId = String(conversationId || "");
  const safeMessageId = String(clientMessageId || "");
  if (!safeConversationId || !safeMessageId) return null;
  const db = await openDb();
  let record = null;
  try {
    record = await new Promise((resolve, reject) => {
      const transaction = db.transaction("history", "readonly");
      const request = transaction.objectStore("history")
        .index("byConversationMessage")
        .get([safeConversationId, safeMessageId]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Encrypted history lookup failed"));
    });
  } finally {
    db.close();
  }
  if (!record) return null;
  try {
    return await decryptHistoryRecord(record, cacheKey);
  } catch {
    return null;
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
  const output = new Array(records.length);
  let nextIndex = 0;
  const workerCount = Math.min(16, records.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < records.length) {
      const index = nextIndex;
      nextIndex += 1;
      const record = records[index];
      try {
        output[index] = await decryptStoredRecord(record.key, record.value, cacheKey);
      } catch {
        output[index] = null;
        // A corrupt local cache record is isolated; MLS network state remains authoritative.
      }
    }
  }));
  return output.filter(Boolean);
}
