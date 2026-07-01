import { getE2EEConversationKeyApi, getE2EEIdentitiesApi, getE2EEIdentityBackupApi, setE2EEConversationKeysApi, setE2EEIdentityApi, setE2EEIdentityBackupApi } from "../services/api";
const E2EE_PREFIX = "__LIOTAN_E2EE_V2__";
const LEGACY_E2EE_PREFIX = "__LIOTAN_E2EE_V1__";
const E2EE_ITERATIONS = 200000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const identityCache = new Map();
const chatSecretMemory = new Map();
const pendingConversationKeys = new Map();
const ATTACHMENT_E2EE_PREFIX = "__LIOTAN_E2EE_FILE_V1__";
const E2EE_DB_NAME = "liotan-e2ee-v2";
const E2EE_DB_VERSION = 1;
const IDENTITY_STORE = "identities";

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
function openE2EEDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(E2EE_DB_NAME, E2EE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}
async function idbGet(storeName, key) {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("IndexedDB get failed"));
    tx.oncomplete = () => db.close();
  });
}
async function idbSet(storeName, key, value) {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("IndexedDB set failed")); };
  });
}
async function idbDelete(storeName, key) {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("IndexedDB delete failed")); };
  });
}
function getConversationId(username, chatKey) {
  const cleanUsername = String(username || "").trim();
  const cleanChatKey = String(chatKey || "").trim();
  if (!cleanUsername || !cleanChatKey) {
    return cleanChatKey;
  }
  if (cleanChatKey.startsWith("group:")) {
    return cleanChatKey;
  }
  return [cleanUsername, cleanChatKey].sort().join("_");
}
export function getEffectiveE2EEChatKey(chatKey, dialog) {
  if (!chatKey) {
    return chatKey || "";
  }
  if (String(chatKey).startsWith("group:")) {
    const version = Number(dialog?.e2eeVersion) || 1;
    return `${chatKey}:v${version}`;
  }
  return chatKey;
}
function safeStorageKey(username, chatKey) {
  return encodeURIComponent(`${username || ""}:${getConversationId(username, chatKey) || ""}`);
}
export function getE2EEStorageKey(username, chatKey) {
  return `liotan:e2ee-secret:${safeStorageKey(username, chatKey)}`;
}
function getIdentityStorageKey(username) {
  return `liotan:e2ee-identity:${encodeURIComponent(username || "")}`;
}
export function getChatSecret(username, chatKey) {
  if (!username || !chatKey) {
    return "";
  }
  return chatSecretMemory.get(getE2EEStorageKey(username, chatKey)) || "";
}
function getLegacyChatSecret(username, chatKey) {
  try {
    return localStorage.getItem(getE2EEStorageKey(username, chatKey)) || "";
  } catch {
    return "";
  }
}
function removeLegacyChatSecret(username, chatKey) {
  try {
    localStorage.removeItem(getE2EEStorageKey(username, chatKey));
  } catch {}
}
export function hasChatSecret(username, chatKey) {
  return Boolean(getChatSecret(username, chatKey) || getLegacyChatSecret(username, chatKey));
}
export function setChatSecret(username, chatKey, secret) {
  if (!username || !chatKey) {
    return;
  }
  const key = getE2EEStorageKey(username, chatKey);
  const cleanSecret = String(secret || "").trim();
  removeLegacyChatSecret(username, chatKey);
  if (!cleanSecret) {
    chatSecretMemory.delete(key);
  } else {
    chatSecretMemory.set(key, cleanSecret);
  }
  window.dispatchEvent(new CustomEvent("liotan:e2ee-updated", {
    detail: {
      username,
      chatKey,
      enabled: Boolean(cleanSecret)
    }
  }));
}
export function isEncryptedText(value) {
  return typeof value === "string" && (value.startsWith(E2EE_PREFIX) || value.startsWith(LEGACY_E2EE_PREFIX));
}
async function deriveMessageKey(secret, salt) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "PBKDF2",
    salt,
    iterations: E2EE_ITERATIONS,
    hash: "SHA-256"
  }, baseKey, {
    name: "AES-GCM",
    length: 256
  }, false, ["encrypt", "decrypt"]);
}
async function deriveBackupKey(password, salt) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(String(password || "")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "PBKDF2",
    salt,
    iterations: E2EE_ITERATIONS,
    hash: "SHA-256"
  }, baseKey, {
    name: "AES-GCM",
    length: 256
  }, false, ["encrypt", "decrypt"]);
}
async function deriveWrapKey({
  privateKey,
  publicKey
}) {
  return crypto.subtle.deriveKey({
    name: "ECDH",
    public: publicKey
  }, privateKey, {
    name: "AES-GCM",
    length: 256
  }, false, ["encrypt", "decrypt"]);
}
function randomSecret() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}
async function importPublicKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, {
    name: "ECDH",
    namedCurve: "P-256"
  }, true, []);
}
async function importPrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, {
    name: "ECDH",
    namedCurve: "P-256"
  }, true, ["deriveKey"]);
}
async function importNonExtractablePrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, {
    name: "ECDH",
    namedCurve: "P-256"
  }, false, ["deriveKey"]);
}
async function loadLegacyIdentity(username) {
  try {
    const raw = localStorage.getItem(getIdentityStorageKey(username));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.privateKey || !data?.publicKey) return null;
    const privateKey = await importNonExtractablePrivateKey(data.privateKey);
    const publicKey = await importPublicKey(data.publicKey);
    const identity = {
      privateKey,
      publicKey,
      publicJwk: data.publicKey,
      legacyPrivateJwk: data.privateKey
    };
    await saveLocalIdentity(username, data.publicKey, privateKey);
    localStorage.removeItem(getIdentityStorageKey(username));
    return identity;
  } catch {
    try { localStorage.removeItem(getIdentityStorageKey(username)); } catch {}
    return null;
  }
}
async function loadLocalIdentity(username) {
  if (!username) {
    return null;
  }
  if (identityCache.has(username)) {
    return identityCache.get(username);
  }
  try {
    const stored = await idbGet(IDENTITY_STORE, getIdentityStorageKey(username));
    if (stored?.privateKey && stored?.publicKey) {
      const identity = {
        privateKey: stored.privateKey,
        publicKey: stored.publicKey,
        publicJwk: stored.publicJwk
      };
      identityCache.set(username, identity);
      return identity;
    }
  } catch {}

  const legacy = await loadLegacyIdentity(username);
  if (legacy) {
    identityCache.set(username, legacy);
    return legacy;
  }

  return null;
}
async function createIdentityPair() {
  const extractablePair = await crypto.subtle.generateKey({
    name: "ECDH",
    namedCurve: "P-256"
  }, true, ["deriveKey"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", extractablePair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", extractablePair.privateKey);
  const privateKey = await importNonExtractablePrivateKey(privateJwk);
  const publicKey = await importPublicKey(publicJwk);
  return {
    privateKey,
    publicKey,
    publicJwk,
    privateJwk
  };
}
async function saveLocalIdentity(username, publicJwk, privateKey) {
  const publicKey = await importPublicKey(publicJwk);
  await idbSet(IDENTITY_STORE, getIdentityStorageKey(username), {
    publicJwk,
    publicKey,
    privateKey
  });
  try { localStorage.removeItem(getIdentityStorageKey(username)); } catch {}
  identityCache.delete(username);
}
async function encryptIdentityBackup({
  publicJwk,
  privateJwk,
  password
}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt);
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv
  }, key, encoder.encode(JSON.stringify(privateJwk)));
  return {
    v: 1,
    alg: "PBKDF2-SHA256-AES-GCM",
    iter: E2EE_ITERATIONS,
    publicKey: publicJwk,
    encryptedPrivateKey: toBase64(new Uint8Array(encrypted)),
    salt: toBase64(salt),
    iv: toBase64(iv)
  };
}
async function decryptIdentityBackup({
  backup,
  password
}) {
  const key = await deriveBackupKey(password, fromBase64(backup.salt));
  const decrypted = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: fromBase64(backup.iv)
  }, key, fromBase64(backup.encryptedPrivateKey));
  return JSON.parse(decoder.decode(decrypted));
}
export async function initE2EEAccountIdentity({
  username,
  password
}) {
  if (!username || !password || !crypto?.subtle) {
    return null;
  }
  let backup = null;
  try {
    const response = await getE2EEIdentityBackupApi();
    backup = response?.backup || null;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("E2EE backup fetch failed", err);
    }
  }
  if (backup?.publicKey && backup?.encryptedPrivateKey) {
    try {
      const privateJwk = await decryptIdentityBackup({
        backup,
        password
      });
      const privateKey = await importNonExtractablePrivateKey(privateJwk);
      await saveLocalIdentity(username, backup.publicKey, privateKey);
      const identity = await loadLocalIdentity(username);
      if (identity) {
        await setE2EEIdentityApi(identity.publicJwk);
      }
      return identity;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("E2EE backup decrypt failed; creating a new identity", err);
      }
    }
  }
  const local = await loadLocalIdentity(username);
  if (local) {
    if (local.legacyPrivateJwk) {
      const nextBackup = await encryptIdentityBackup({
        publicJwk: local.publicJwk,
        privateJwk: local.legacyPrivateJwk,
        password
      });
      await setE2EEIdentityBackupApi(nextBackup);
    }
    await setE2EEIdentityApi(local.publicJwk);
    return local;
  }
  const created = await createIdentityPair();
  await saveLocalIdentity(username, created.publicJwk, created.privateKey);
  const nextBackup = await encryptIdentityBackup({
    publicJwk: created.publicJwk,
    privateJwk: created.privateJwk,
    password
  });
  await setE2EEIdentityBackupApi(nextBackup);
  await setE2EEIdentityApi(created.publicJwk);
  return loadLocalIdentity(username);
}
export async function ensureE2EEIdentity(username) {
  if (!username || !crypto?.subtle) {
    return null;
  }
  const existing = await loadLocalIdentity(username);
  if (existing) {
    await setE2EEIdentityApi(existing.publicJwk);
    return existing;
  }
  return null;
}
async function wrapSecretForUser({
  identity,
  username,
  recipient,
  recipientPublicJwk,
  secret
}) {
  const recipientPublicKey = await importPublicKey(recipientPublicJwk);
  const wrapKey = await deriveWrapKey({
    privateKey: identity.privateKey,
    publicKey: recipientPublicKey
  });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv
  }, wrapKey, encoder.encode(secret));
  return {
    user: recipient,
    sender: username,
    wrappedKey: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    alg: "ECDH-P256-AES-GCM"
  };
}
async function unwrapSecret({
  identity,
  senderPublicJwk,
  wrappedKey,
  iv
}) {
  const senderPublicKey = await importPublicKey(senderPublicJwk);
  const wrapKey = await deriveWrapKey({
    privateKey: identity.privateKey,
    publicKey: senderPublicKey
  });
  const decrypted = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: fromBase64(iv)
  }, wrapKey, fromBase64(wrappedKey));
  return decoder.decode(decrypted);
}
function cleanParticipants(participants) {
  return [...new Set((participants || []).map(item => String(item || "").trim()).filter(Boolean))];
}
export async function ensureConversationSecret({
  username,
  chatKey,
  participants = []
}) {
  if (!username || !chatKey) {
    return "";
  }
  const current = getChatSecret(username, chatKey) || getLegacyChatSecret(username, chatKey);
  if (current) {
    setChatSecret(username, chatKey, current);
  }
  const pendingKey = `${username}:${chatKey}`;
  if (pendingConversationKeys.has(pendingKey)) {
    return pendingConversationKeys.get(pendingKey);
  }
  const promise = (async () => {
    const identity = await ensureE2EEIdentity(username);
    if (!identity) {
      return current;
    }
    if (!current) {
      try {
        const conversationId = getConversationId(username, chatKey);
        const response = await getE2EEConversationKeyApi(conversationId);
        const wrapped = response?.key;
        if (wrapped?.wrappedKey && wrapped?.sender) {
          const identities = await getE2EEIdentitiesApi([wrapped.sender]);
          const sender = identities?.users?.find(item => item.username === wrapped.sender);
          if (sender?.publicKey) {
            const unlockedSecret = await unwrapSecret({
              identity,
              senderPublicJwk: sender.publicKey,
              wrappedKey: wrapped.wrappedKey,
              iv: wrapped.iv
            });
            setChatSecret(username, chatKey, unlockedSecret);
            return unlockedSecret;
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("E2EE key fetch failed", err);
        }
      }
    }
    const secret = getChatSecret(username, chatKey) || getLegacyChatSecret(username, chatKey) || randomSecret();
    setChatSecret(username, chatKey, secret);
    const safeParticipants = cleanParticipants([username, ...participants]);
    try {
      const identities = await getE2EEIdentitiesApi(safeParticipants);
      const users = identities?.users || [];
      const wrappedKeys = [];
      for (const user of users) {
        if (!user?.username || !user?.publicKey) {
          continue;
        }
        try {
          wrappedKeys.push(await wrapSecretForUser({
            identity,
            username,
            recipient: user.username,
            recipientPublicJwk: user.publicKey,
            secret
          }));
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("E2EE wrap failed for user", user.username, err);
          }
        }
      }
      if (wrappedKeys.length) {
        await setE2EEConversationKeysApi(getConversationId(username, chatKey), wrappedKeys);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("E2EE key publish failed", err);
      }
    }
    return secret;
  })();
  pendingConversationKeys.set(pendingKey, promise);
  try {
    return await promise;
  } finally {
    pendingConversationKeys.delete(pendingKey);
  }
}
export function isEncryptedAttachment(attachment) {
  return Boolean(attachment?.e2eeMedia?.v === 1 && attachment.e2eeMedia.iv && attachment.e2eeMedia.salt);
}
export async function encryptAttachmentFileForChat({
  username,
  chatKey,
  participants,
  file,
  originalTypeOverride = "",
  uploadExtension = ".liotanenc"
}) {
  if (!file) {
    return null;
  }
  const secret = await ensureConversationSecret({
    username,
    chatKey,
    participants
  });
  if (!secret || !crypto?.subtle) {
    return {
      uploadFile: file,
      metadata: null
    };
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveMessageKey(secret, salt);
  const plain = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv
  }, key, plain);
  const originalName = file.name || "file";
  const safeExtension = String(uploadExtension || ".liotanenc")
    .trim()
    .replace(/[^a-z0-9.]/gi, "") || ".liotanenc";
  const uploadFile = new File([encrypted], `${originalName}${safeExtension}`, {
    type: "application/octet-stream",
    lastModified: Date.now()
  });
  return {
    uploadFile,
    metadata: {
      v: 1,
      prefix: ATTACHMENT_E2EE_PREFIX,
      alg: "AES-GCM-256",
      kdf: "PBKDF2-SHA256",
      iter: E2EE_ITERATIONS,
      salt: toBase64(salt),
      iv: toBase64(iv),
      kid: chatKey,
      originalName,
      originalType: originalTypeOverride || getAttachmentTypeFromMime(file.type),
      originalMimeType: file.type || "application/octet-stream",
      originalSize: file.size
    }
  };
}
function getAttachmentTypeFromMime(mimeType = "") {
  if (mimeType.startsWith("image/")) {
    return "photo";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return "file";
}
export async function decryptAttachmentBlobForChat({
  username,
  chatKey,
  attachment,
  blob
}) {
  if (!isEncryptedAttachment(attachment)) {
    return blob;
  }
  const meta = attachment.e2eeMedia;
  const secret = getChatSecret(username, meta.kid || chatKey);
  if (!secret) {
    throw new Error("E2EE media key is not available");
  }
  const key = await deriveMessageKey(secret, fromBase64(meta.salt));
  const decrypted = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: fromBase64(meta.iv)
  }, key, await blob.arrayBuffer());
  return new Blob([decrypted], {
    type: meta.originalMimeType || attachment.mimeType || "application/octet-stream"
  });
}
export async function encryptTextForChat({
  username,
  chatKey,
  participants,
  text
}) {
  if (!text || isEncryptedText(text)) {
    return text || "";
  }
  const secret = await ensureConversationSecret({
    username,
    chatKey,
    participants
  });
  if (!secret) {
    return text;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveMessageKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv
  }, key, encoder.encode(text));
  const payload = {
    v: 2,
    alg: "AES-GCM-256",
    kdf: "PBKDF2-SHA256",
    iter: E2EE_ITERATIONS,
    kid: chatKey,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(encrypted))
  };
  return `${E2EE_PREFIX}${btoa(JSON.stringify(payload))}`;
}
export async function decryptTextForChat({
  username,
  chatKey,
  text
}) {
  if (!isEncryptedText(text)) {
    return text || "";
  }
  if (text.startsWith(LEGACY_E2EE_PREFIX)) {
    return "Старое E2EE-сообщение. Оно было создано до авто-ключей.";
  }
  try {
    const payload = JSON.parse(atob(text.slice(E2EE_PREFIX.length)));
    if (payload?.v !== 2) {
      throw new Error("Unsupported E2EE version");
    }
    const secret = getChatSecret(username, payload.kid || chatKey);
    if (!secret) {
      return "Зашифрованное сообщение. Ключ этого чата ещё не получен.";
    }
    const salt = fromBase64(payload.salt);
    const iv = fromBase64(payload.iv);
    const ct = fromBase64(payload.ct);
    const key = await deriveMessageKey(secret, salt);
    const decrypted = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv
    }, key, ct);
    return decoder.decode(decrypted);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("E2EE decrypt failed", err);
    }
    return "Не удалось расшифровать сообщение.";
  }
}
