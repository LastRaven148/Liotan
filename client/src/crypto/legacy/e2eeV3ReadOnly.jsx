import { decryptMlsMediaBlob } from "../mlsEngine";
import { getChatId } from "../../utils/chat";
const E2EE_PREFIX = "__LIOTAN_E2EE_V2__";
const LEGACY_E2EE_PREFIX = "__LIOTAN_E2EE_V1__";
const E2EE_ITERATIONS = 200000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const chatSecretMemory = new Map();
const ATTACHMENT_E2EE_PREFIX = "__LIOTAN_E2EE_FILE_V1__";
const E2EE_DB_NAME = "liotan-e2ee-v2";
const E2EE_DB_VERSION = 3;
const IDENTITY_STORE = "identities";
const TRUST_STORE = "trusted-public-keys";
const REPLAY_STORE = "replay-envelopes";

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
async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return toBase64(new Uint8Array(digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function canonicalAad({ conversationId, sender, contentType, nonce }) {
  return encoder.encode(JSON.stringify([
    "liotan-e2ee-v3",
    String(conversationId || ""),
    String(sender || ""),
    String(contentType || ""),
    String(nonce || "")
  ]));
}

function getSecretSlot(chatKey, protocolConversationId) {
  return String(chatKey || "").startsWith("group:")
    ? String(protocolConversationId || chatKey)
    : String(chatKey || "");
}

function isExpectedConversation(username, chatKey, protocolConversationId) {
  const local = String(chatKey || "");
  const protocol = String(protocolConversationId || "");
  if (local.startsWith("group:")) {
    return protocol === local || protocol.startsWith(`${local}:v`);
  }
  return protocol === getConversationId(username, local);
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
      if (!db.objectStoreNames.contains(TRUST_STORE)) {
        db.createObjectStore(TRUST_STORE);
      }
      if (!db.objectStoreNames.contains(REPLAY_STORE)) {
        db.createObjectStore(REPLAY_STORE);
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
async function assertNotReplayed({ username, conversationId, sender, nonce, messageId, ciphertext }) {
  if (!messageId || !nonce) return;
  const replayKey = await sha256Base64Url(JSON.stringify([
    username, conversationId, sender, nonce
  ]));
  const digest = await sha256Base64Url(ciphertext);
  const existing = await idbGet(REPLAY_STORE, replayKey);
  if (existing && (existing.messageId !== messageId || existing.digest !== digest)) {
    throw new Error("Replayed E2EE envelope rejected");
  }
  if (!existing) {
    await idbSet(REPLAY_STORE, replayKey, {
      messageId,
      digest,
      firstSeenAt: new Date().toISOString()
    });
  }
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
  return getChatId(cleanUsername, cleanChatKey);
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
function safeE2EEVaultId(username, chatKey) {
  return encodeURIComponent(`${username || ""}:${getConversationId(username, chatKey) || ""}`);
}
export function getE2EEVaultId(username, chatKey) {
  return `liotan:e2ee-secret:${safeE2EEVaultId(username, chatKey)}`;
}
export function getChatSecret(username, chatKey) {
  if (!username || !chatKey) {
    return "";
  }
  return chatSecretMemory.get(getE2EEVaultId(username, chatKey)) || "";
}
function removeLegacyChatSecret(username, chatKey) {
  try {
    localStorage.removeItem(getE2EEVaultId(username, chatKey));
  } catch {}
}
export function hasChatSecret(username, chatKey) {
  return Boolean(getChatSecret(username, chatKey));
}
export function setChatSecret(username, chatKey, secret) {
  if (!username || !chatKey) {
    return false;
  }

  const key = getE2EEVaultId(username, chatKey);
  const cleanSecret = String(secret || "").trim();
  const previousSecret = chatSecretMemory.get(key) || "";

  if (previousSecret === cleanSecret) {
    removeLegacyChatSecret(username, chatKey);
    if (cleanSecret) {
      chatSecretMemory.set(key, cleanSecret);
    } else {
      chatSecretMemory.delete(key);
    }
    return false;
  }

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

  return true;
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
export async function ensureConversationSecret({ username, chatKey }) {
  if (!username || !chatKey) return "";
  const current = getChatSecret(username, chatKey);
  if (current) {
    setChatSecret(username, chatKey, current);
    return current;
  }
  throw new Error("Legacy E2EE private-key delivery is disabled; MLS v4 is required");
}
export function isEncryptedAttachment(attachment) {
  return Boolean(
    attachment?.mlsMedia?.v === 1 ||
    ([1, 2].includes(attachment?.e2eeMedia?.v) && attachment.e2eeMedia.iv && attachment.e2eeMedia.salt)
  );
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
export async function decryptAttachmentMetadataForChat({
  username,
  chatKey,
  attachment
}) {
  if (attachment?.mlsMedia?.v === 1) {
    const original = attachment.mlsMedia.original;
    return original ? {
      originalName: original.name,
      originalType: original.type,
      originalMimeType: original.mimeType,
      originalSize: original.size,
      duration: original.duration || 0,
      waveform: original.waveform || [],
      width: original.width || 0,
      height: original.height || 0
    } : null;
  }
  if (!isEncryptedAttachment(attachment) || !attachment.e2eeMedia?.meta || !attachment.e2eeMedia?.metaIv) {
    return null;
  }

  const meta = attachment.e2eeMedia;
  if (meta.v === 2 && !isExpectedConversation(username, chatKey, meta.kid)) {
    return null;
  }
  const secretSlot = getSecretSlot(chatKey, meta.kid);
  let secret = getChatSecret(username, secretSlot);
  if (!secret) {
    try {
      secret = await ensureConversationSecret({
        username,
        chatKey: secretSlot,
        participants: meta.sender ? [meta.sender] : []
      });
    } catch {}
  }
  if (!secret) {
    return null;
  }

  try {
    const key = await deriveMessageKey(secret, fromBase64(meta.salt));
    const decrypted = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: fromBase64(meta.metaIv),
      ...(meta.v === 2 ? {
        additionalData: canonicalAad({
          conversationId: meta.kid,
          sender: meta.sender,
          contentType: "media-metadata",
          nonce: meta.nonce
        })
      } : {})
    }, key, fromBase64(meta.meta).buffer);

    const parsed = JSON.parse(decoder.decode(decrypted));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function decryptAttachmentBlobForChat({
  username,
  chatKey,
  attachment,
  blob
}) {
  if (attachment?.mlsMedia?.v === 1) {
    return decryptMlsMediaBlob(attachment, blob);
  }
  if (!isEncryptedAttachment(attachment)) {
    return blob;
  }
  const meta = attachment.e2eeMedia;
  if (meta.v === 2 && !isExpectedConversation(username, chatKey, meta.kid)) {
    throw new Error("E2EE media conversation mismatch");
  }
  const secretSlot = getSecretSlot(chatKey, meta.kid);
  let secret = getChatSecret(username, secretSlot);
  if (!secret) {
    secret = await ensureConversationSecret({
      username,
      chatKey: secretSlot,
      participants: meta.sender ? [meta.sender] : []
    });
  }
  if (!secret) {
    throw new Error("E2EE media key is not available");
  }
  const key = await deriveMessageKey(secret, fromBase64(meta.salt));
  const decrypted = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: fromBase64(meta.iv),
    ...(meta.v === 2 ? {
      additionalData: canonicalAad({
        conversationId: meta.kid,
        sender: meta.sender,
        contentType: "media",
        nonce: meta.nonce
      })
    } : {})
  }, key, await blob.arrayBuffer());
  const privateMeta = await decryptAttachmentMetadataForChat({
    username,
    chatKey,
    attachment
  });
  const originalSize = Number(privateMeta?.originalSize);
  const plain = Number.isFinite(originalSize) && originalSize >= 0
    ? decrypted.slice(0, originalSize)
    : decrypted;

  return new Blob([plain], {
    type: privateMeta?.originalMimeType || attachment.mimeType || "application/octet-stream"
  });
}
export function encryptedContentToText(encryptedContent) {
  if (!encryptedContent?.ciphertext || !encryptedContent?.iv || !encryptedContent?.salt) {
    return "";
  }
  const payload = {
    v: encryptedContent.version || 2,
    alg: encryptedContent.alg || "AES-GCM-256",
    kdf: encryptedContent.kdf || "PBKDF2-SHA256",
    iter: encryptedContent.iter || E2EE_ITERATIONS,
    kid: encryptedContent.kid || "",
    sender: encryptedContent.sender || "",
    contentType: encryptedContent.contentType || "text",
    salt: encryptedContent.salt || "",
    iv: encryptedContent.iv || "",
    ct: encryptedContent.ciphertext || "",
    nonce: encryptedContent.nonce || ""
  };
  return `${E2EE_PREFIX}${btoa(JSON.stringify(payload))}`;
}
export async function decryptTextForChat({
  username,
  chatKey,
  sender = "",
  messageId = "",
  text,
  encryptedContent = null
}) {
  const encryptedText = text || encryptedContentToText(encryptedContent);
  if (!isEncryptedText(encryptedText)) {
    return text || "";
  }
  text = encryptedText;
  if (text.startsWith(LEGACY_E2EE_PREFIX)) {
    return "РЎС‚Р°СЂРѕРµ E2EE-СЃРѕРѕР±С‰РµРЅРёРµ. РћРЅРѕ Р±С‹Р»Рѕ СЃРѕР·РґР°РЅРѕ РґРѕ Р°РІС‚Рѕ-РєР»СЋС‡РµР№.";
  }
  try {
    const payload = JSON.parse(atob(text.slice(E2EE_PREFIX.length)));
    if (![2, 3].includes(payload?.v)) {
      throw new Error("Unsupported E2EE version");
    }
    if (payload.v === 3) {
      if (!isExpectedConversation(username, chatKey, payload.kid)) {
        throw new Error("E2EE conversation mismatch");
      }
      if (sender && payload.sender !== sender) {
        throw new Error("E2EE sender mismatch");
      }
      await assertNotReplayed({
        username,
        conversationId: payload.kid,
        sender: payload.sender,
        nonce: payload.nonce,
        messageId,
        ciphertext: payload.ct
      });
    }
    const secretKey = getSecretSlot(chatKey, payload.kid);
    let secret = getChatSecret(username, secretKey);
    if (!secret) {
      try {
        secret = await ensureConversationSecret({
          username,
          chatKey: secretKey,
          participants: payload.sender ? [payload.sender] : []
        });
      } catch {}
    }
    if (secret) {
      setChatSecret(username, secretKey, secret);
    }
    if (!secret) {
      return "Р—Р°С€РёС„СЂРѕРІР°РЅРЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ. РљР»СЋС‡ СЌС‚РѕРіРѕ С‡Р°С‚Р° РµС‰С‘ РЅРµ РїРѕР»СѓС‡РµРЅ.";
    }
    const salt = fromBase64(payload.salt);
    const iv = fromBase64(payload.iv);
    const ct = fromBase64(payload.ct);
    const key = await deriveMessageKey(secret, salt);
    const decrypted = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv,
      ...(payload.v === 3 ? {
        additionalData: canonicalAad({
          conversationId: payload.kid,
          sender: payload.sender,
          contentType: payload.contentType,
          nonce: payload.nonce
        })
      } : {})
    }, key, ct);
    return decoder.decode(decrypted);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("E2EE decrypt failed", err);
    }
    return "РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°СЃС€РёС„СЂРѕРІР°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ.";
  }
}
