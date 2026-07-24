import { base64UrlToBytes, bytesToBase64Url, randomBytes, textDecoder, textEncoder } from "./encoding";

const DB_NAME = "liotan-local-crypto-v4";
const DB_VERSION = 2;
const wrappingKeyPromises = new Map();
const recoveryUnlockPromises = new Map();
const deviceRequestKeyPromises = new Map();
const RECOVERY_PBKDF2_ITERATIONS = 600000;

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

async function idbDelete(storeName, key) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB delete failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB delete aborted"));
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

async function idbDeleteHistoryConversation(conversationId, clientMessageId = "") {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("history", "readwrite");
      const store = transaction.objectStore("history");
      const indexName = clientMessageId ? "byConversationMessage" : "byConversationSequence";
      const index = store.index(indexName);
      const range = clientMessageId
        ? IDBKeyRange.only([conversationId, clientMessageId])
        : IDBKeyRange.bound([conversationId, 0], [conversationId, Number.MAX_SAFE_INTEGER]);
      const request = index.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error || new Error("IndexedDB history delete failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB history delete aborted"));
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

async function loadOrCreateDeviceWrappingKey(username, deviceId) {
  const keyId = `device-auth-wrap:${username}:${deviceId}`;
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
    if (!key) throw new Error("Unable to load the winning device wrapping key");
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

async function loadOrCreateDeviceRequestSecretInternal(username, deviceId) {
  const recordKey = `device-auth-v2:${username}:${deviceId}`;
  const additionalData = textEncoder.encode(`liotan-device-auth-wrap-v2:${username}:${deviceId}`);
  const wrapping = await loadOrCreateDeviceWrappingKey(username, deviceId);
  let record = await idbGet("records", recordKey);
  if (!record) {
    const secret = randomBytes(32);
    const iv = randomBytes(12);
    let ciphertext;
    let keepSecret = false;
    try {
      ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name: "AES-GCM",
        iv,
        additionalData
      }, wrapping, secret));
      const candidate = {
        v: 2,
        algorithm: "AES-GCM",
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(ciphertext)
      };
      try {
        await idbAdd("records", recordKey, candidate);
        keepSecret = true;
        return secret;
      } catch (error) {
        if (error?.name !== "ConstraintError") throw error;
        record = await idbGet("records", recordKey);
      }
    } finally {
      iv.fill(0);
      ciphertext?.fill(0);
      if (!keepSecret) secret.fill(0);
    }
  }
  if (record?.v !== 2 || record.algorithm !== "AES-GCM") {
    throw new Error("Unsupported local device authentication record");
  }
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64UrlToBytes(record.iv, 12),
    additionalData
  }, wrapping, base64UrlToBytes(record.ciphertext)));
  if (plaintext.length !== 32) {
    plaintext.fill(0);
    throw new Error("Local device authentication record is damaged");
  }
  return plaintext;
}

export function loadOrCreateDeviceRequestSecret(username, deviceId) {
  const key = `${String(username || "")}:${String(deviceId || "")}`;
  if (!deviceRequestKeyPromises.has(key)) {
    deviceRequestKeyPromises.set(
      key,
      loadOrCreateDeviceRequestSecretInternal(username, deviceId)
        .finally(() => deviceRequestKeyPromises.delete(key))
    );
  }
  return deviceRequestKeyPromises.get(key);
}

export async function deleteDeviceRequestSecret(username, deviceId) {
  const key = `${String(username || "")}:${String(deviceId || "")}`;
  deviceRequestKeyPromises.delete(key);
  await Promise.all([
    idbDelete("records", `device-auth-v2:${username}:${deviceId}`),
    idbDelete("keys", `device-auth-wrap:${username}:${deviceId}`)
  ]);
}

export function normalizeRecoveryKey(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, "");
  const bytes = base64UrlToBytes(normalized, 32);
  return { encoded: bytesToBase64Url(bytes), bytes };
}

export function createRecoveryKey() {
  return bytesToBase64Url(randomBytes(32));
}

function recoveryPresenceError(message = "Local recovery passphrase is required") {
  const error = new Error(message);
  error.code = "recovery-user-presence-required";
  return error;
}

async function deriveRecoveryPassphraseKey(passphrase, salt, iterations = RECOVERY_PBKDF2_ITERATIONS) {
  const passphraseBytes = textEncoder.encode(String(passphrase || ""));
  if (passphraseBytes.length < 10) {
    passphraseBytes.fill(0);
    throw new TypeError("Local recovery passphrase must contain at least 10 characters");
  }
  try {
    const material = await crypto.subtle.importKey("raw", passphraseBytes, "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } finally {
    passphraseBytes.fill(0);
  }
}

async function createPassphraseRecoveryRecord(username, recoveryBytes, passphrase) {
  const salt = randomBytes(16);
  const innerIv = randomBytes(12);
  const outerIv = randomBytes(12);
  const passphraseKey = await deriveRecoveryPassphraseKey(passphrase, salt);
  const innerCiphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: innerIv,
    additionalData: textEncoder.encode(`liotan-recovery-passphrase-v2:${username}`)
  }, passphraseKey, recoveryBytes));
  const innerPlaintext = textEncoder.encode(JSON.stringify({
    v: 1,
    iv: bytesToBase64Url(innerIv),
    ciphertext: bytesToBase64Url(innerCiphertext)
  }));
  let outerCiphertext;
  try {
    const outerKey = await wrappingKey(username);
    outerCiphertext = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv: outerIv,
      additionalData: textEncoder.encode(`liotan-recovery-wrap-v2:${username}`)
    }, outerKey, innerPlaintext));
    return {
      v: 2,
      requiresUserPresence: true,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: RECOVERY_PBKDF2_ITERATIONS,
        salt: bytesToBase64Url(salt)
      },
      outerIv: bytesToBase64Url(outerIv),
      outerCiphertext: bytesToBase64Url(outerCiphertext)
    };
  } finally {
    salt.fill(0);
    innerIv.fill(0);
    outerIv.fill(0);
    innerCiphertext.fill(0);
    innerPlaintext.fill(0);
    outerCiphertext?.fill(0);
  }
}

async function createWrappingRecoveryRecord(username, recoveryBytes) {
  const key = await wrappingKey(username);
  const iv = randomBytes(12);
  let ciphertext;
  try {
    ciphertext = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv,
      additionalData: textEncoder.encode(`liotan-recovery-wrap-v1:${username}`)
    }, key, recoveryBytes));
    return {
      v: 1,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(ciphertext)
    };
  } finally {
    iv.fill(0);
    ciphertext?.fill(0);
  }
}

async function decryptPassphraseRecoveryRecord(username, record, passphrase) {
  if (!passphrase) throw recoveryPresenceError();
  const iterations = Number(record?.kdf?.iterations);
  if (record?.kdf?.name !== "PBKDF2" || record?.kdf?.hash !== "SHA-256" ||
    !Number.isSafeInteger(iterations) || iterations < RECOVERY_PBKDF2_ITERATIONS) {
    throw new Error("Unsupported local recovery protection parameters");
  }
  let outerPlaintext;
  let innerPlaintext;
  try {
    const outerKey = await wrappingKey(username);
    outerPlaintext = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: base64UrlToBytes(record.outerIv, 12),
      additionalData: textEncoder.encode(`liotan-recovery-wrap-v2:${username}`)
    }, outerKey, base64UrlToBytes(record.outerCiphertext)));
    const inner = JSON.parse(textDecoder.decode(outerPlaintext));
    const passphraseKey = await deriveRecoveryPassphraseKey(
      passphrase,
      base64UrlToBytes(record.kdf.salt, 16),
      iterations
    );
    innerPlaintext = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: base64UrlToBytes(inner.iv, 12),
      additionalData: textEncoder.encode(`liotan-recovery-passphrase-v2:${username}`)
    }, passphraseKey, base64UrlToBytes(inner.ciphertext)));
    return bytesToBase64Url(innerPlaintext);
  } catch (cause) {
    if (cause?.code === "recovery-user-presence-required" || cause instanceof TypeError) throw cause;
    const error = new Error("Local recovery passphrase is incorrect or the store is damaged");
    error.code = "recovery-unlock-failed";
    throw error;
  } finally {
    outerPlaintext?.fill(0);
    innerPlaintext?.fill(0);
  }
}

export async function saveRecoveryKey(username, encodedRecoveryKey, options = {}) {
  const { encoded, bytes } = normalizeRecoveryKey(encodedRecoveryKey);
  try {
    if (options.passphrase) {
      const protectedRecord = await createPassphraseRecoveryRecord(username, bytes, options.passphrase);
      await idbPut("records", `recovery:${username}`, protectedRecord);
      return encoded;
    }
    const current = await idbGet("records", `recovery:${username}`);
    if (current?.v === 2) throw recoveryPresenceError("Passphrase-protected recovery storage cannot be overwritten silently");
    await idbPut("records", `recovery:${username}`, await createWrappingRecoveryRecord(username, bytes));
    return encoded;
  } finally {
    bytes.fill(0);
  }
}

async function loadRecoveryKeyInternal(username, options = {}) {
  const migrationKey = `recovery-migration:${username}`;
  const pendingMigration = await idbGet("records", migrationKey);
  const storedRecord = await idbGet("records", `recovery:${username}`);
  const record = pendingMigration?.v === 2 ? pendingMigration : storedRecord;
  if (!record) return "";
  if (record.v === 2) {
    const value = await decryptPassphraseRecoveryRecord(username, record, options.passphrase);
    if (pendingMigration?.v === 2) {
      await idbPut("records", `recovery:${username}`, pendingMigration);
      await idbDelete("records", migrationKey);
    }
    return value;
  }
  if (record.v !== 1) throw new Error("Unsupported local recovery record");
  const key = await wrappingKey(username);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64UrlToBytes(record.iv, 12),
    additionalData: textEncoder.encode(`liotan-recovery-wrap-v1:${username}`)
  }, key, base64UrlToBytes(record.ciphertext)));
  try {
    const value = bytesToBase64Url(plaintext);
    if (pendingMigration?.v === 1) {
      await idbPut("records", `recovery:${username}`, pendingMigration);
      await idbDelete("records", migrationKey);
    }
    return value;
  } finally {
    plaintext.fill(0);
  }
}

export function loadRecoveryKey(username, options = {}) {
  const key = String(username || "");
  if (!recoveryUnlockPromises.has(key)) {
    recoveryUnlockPromises.set(
      key,
      loadRecoveryKeyInternal(key, options).finally(() => recoveryUnlockPromises.delete(key))
    );
  }
  return recoveryUnlockPromises.get(key);
}

export async function getRecoveryProtectionStatus(username) {
  const pending = await idbGet("records", `recovery-migration:${username}`);
  const record = pending || await idbGet("records", `recovery:${username}`);
  return {
    configured: Boolean(record),
    requiresUserPresence: record?.v === 2,
    migrationPending: Boolean(pending)
  };
}

export async function enableRecoveryProtection(username, passphrase) {
  const current = await loadRecoveryKey(username);
  if (!current) throw new Error("Recovery key is not stored on this device");
  const { bytes } = normalizeRecoveryKey(current);
  try {
    const protectedRecord = await createPassphraseRecoveryRecord(username, bytes, passphrase);
    const migrationKey = `recovery-migration:${username}`;
    await idbPut("records", migrationKey, protectedRecord);
    await idbPut("records", `recovery:${username}`, protectedRecord);
    await idbDelete("records", migrationKey);
    return { requiresUserPresence: true };
  } finally {
    bytes.fill(0);
  }
}

export async function disableRecoveryProtection(username, passphrase) {
  const current = await loadRecoveryKey(username, { passphrase });
  if (!current) throw new Error("Recovery key is not stored on this device");
  const { bytes } = normalizeRecoveryKey(current);
  try {
    const unprotectedRecord = await createWrappingRecoveryRecord(username, bytes);
    const migrationKey = `recovery-migration:${username}`;
    await idbPut("records", migrationKey, unprotectedRecord);
    await idbPut("records", `recovery:${username}`, unprotectedRecord);
    await idbDelete("records", migrationKey);
  } finally {
    bytes.fill(0);
  }
  return { requiresUserPresence: false };
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

export async function deleteEncryptedMessageRecord(conversationId, clientMessageId) {
  const safeConversationId = String(conversationId || "");
  const safeMessageId = String(clientMessageId || "");
  if (!safeConversationId || !safeMessageId) return;
  await idbDeleteHistoryConversation(safeConversationId, safeMessageId);
  await idbDelete("records", `secure:message:${safeConversationId}:${safeMessageId}`);
}

export async function deleteEncryptedConversationData(conversationId) {
  const safeConversationId = String(conversationId || "");
  if (!safeConversationId) return;
  await idbDeleteHistoryConversation(safeConversationId);
  await Promise.all([
    idbDeletePrefix("records", `secure:message:${safeConversationId}:`),
    idbDeletePrefix("records", `secure:sync-checkpoint:${safeConversationId}:`),
    idbDelete("records", `secure:pending-commit:${safeConversationId}`),
    idbDelete("records", `secure:hidden-messages:${safeConversationId}`)
  ]);
}

export async function deleteLocalCryptoStore() {
  wrappingKeyPromises.clear();
  recoveryUnlockPromises.clear();
  deviceRequestKeyPromises.clear();
  if (!globalThis.indexedDB) return;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Unable to delete local crypto store"));
    request.onblocked = () => reject(new Error("Local crypto store is blocked by another tab"));
  });
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
