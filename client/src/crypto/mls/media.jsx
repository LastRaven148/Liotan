import { sha256 } from "@noble/hashes/sha2.js";
import { signedCryptoRequest } from "../cryptoApi";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJson,
  randomBytes,
  randomId,
  textEncoder,
  wipe
} from "../encoding";
import { MEDIA_CHUNK_SIZE, MEDIA_MAGIC } from "./constants";
import { mediaType, safeMediaMime } from "./envelope";

export async function encryptAndUploadMedia(state, file, clientMessageId, options = {}) {
  const keyBytes = randomBytes(32);
  const noncePrefix = randomBytes(8);
  const bindingId = randomId(24);
  const chunks = Math.max(1, Math.ceil(file.size / MEDIA_CHUNK_SIZE));
  const aesKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const encryptedParts = [MEDIA_MAGIC];
  const hasher = sha256.create().update(MEDIA_MAGIC);
  try {
    for (let index = 0; index < chunks; index += 1) {
      const start = index * MEDIA_CHUNK_SIZE;
      const source = new Uint8Array(await file.slice(start, Math.min(file.size, start + MEDIA_CHUNK_SIZE)).arrayBuffer());
      const plaintext = new Uint8Array(MEDIA_CHUNK_SIZE);
      plaintext.set(source);
      wipe(source);
      let encrypted;
      try {
        for (let offset = Math.min(file.size - start, MEDIA_CHUNK_SIZE); offset < MEDIA_CHUNK_SIZE; offset += 65536) {
          crypto.getRandomValues(plaintext.subarray(offset, Math.min(MEDIA_CHUNK_SIZE, offset + 65536)));
        }
        const iv = new Uint8Array(12);
        iv.set(noncePrefix, 0);
        new DataView(iv.buffer).setUint32(8, index, false);
        const aad = textEncoder.encode(canonicalJson([
          "liotan-mls-media-chunk-v1",
          state.conversationId,
          clientMessageId,
          bindingId,
          index,
          chunks
        ]));
        encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, aesKey, plaintext));
      } finally {
        wipe(plaintext);
      }
      encryptedParts.push(encrypted);
      hasher.update(encrypted);
    }
    const ciphertextHash = bytesToBase64Url(hasher.digest());
    const blob = new Blob(encryptedParts, { type: "application/octet-stream" });
    const signingBody = {
      conversationId: state.conversationId,
      bindingId,
      ciphertextHash,
      bytes: String(blob.size),
      version: "mls-media-1"
    };
    const formData = new FormData();
    Object.entries(signingBody).forEach(([name, value]) => formData.set(name, value));
    formData.set("attachment", new File([blob], `${bindingId}.liotanmedia`, { type: "application/octet-stream" }));
    const upload = await signedCryptoRequest("/crypto/v4/media/upload", {
      method: "POST",
      body: signingBody,
      formData
    });
    return {
      v: 1,
      conversationId: state.conversationId,
      messageId: clientMessageId,
      uploadId: upload.uploadId,
      bindingId,
      ciphertextHash,
      key: bytesToBase64Url(keyBytes),
      noncePrefix: bytesToBase64Url(noncePrefix),
      chunkSize: MEDIA_CHUNK_SIZE,
      chunks,
      ciphertextBytes: blob.size,
      original: {
        name: String(file.name || "file").slice(0, 160),
        type: mediaType(file, options.originalTypeOverride),
        mimeType: safeMediaMime(file),
        size: file.size,
        duration: Number(options.privateMetadata?.duration) || 0,
        waveform: Array.isArray(options.privateMetadata?.waveform) ? options.privateMetadata.waveform.slice(0, 64) : [],
        width: 0,
        height: 0
      }
    };
  } finally {
    wipe(keyBytes);
    wipe(noncePrefix);
  }
}

export async function downloadMlsCiphertext(attachment) {
  const uploadId = attachment?.mlsMedia?.uploadId || attachment?.uploadId;
  if (!uploadId) throw new Error("Missing MLS media id");
  const response = await signedCryptoRequest(`/crypto/v4/media/${encodeURIComponent(uploadId)}`, { raw: true });
  return response.blob();
}

export async function decryptMlsMediaBlob(attachment, blob) {
  const descriptor = attachment?.mlsMedia;
  if (!descriptor || descriptor.v !== 1 || descriptor.uploadId !== attachment.uploadId) {
    throw new Error("Invalid MLS media descriptor");
  }
  const originalSize = Number(descriptor.original?.size);
  const expectedChunks = Math.max(1, Math.ceil(originalSize / MEDIA_CHUNK_SIZE));
  const expectedCiphertextBytes = MEDIA_MAGIC.length + expectedChunks * (MEDIA_CHUNK_SIZE + 16);
  if (
    !Number.isSafeInteger(originalSize) || originalSize < 0 || originalSize > 100 * 1024 * 1024 ||
    descriptor.chunkSize !== MEDIA_CHUNK_SIZE || descriptor.chunks !== expectedChunks ||
    descriptor.ciphertextBytes !== expectedCiphertextBytes ||
    !/^[A-Za-z0-9_-]{22,96}$/.test(String(descriptor.bindingId || "")) ||
    !/^[0-9a-f-]{36}$/i.test(String(descriptor.messageId || ""))
  ) {
    throw new Error("Invalid MLS media bounds");
  }
  if (blob.size !== descriptor.ciphertextBytes) {
    throw new Error("MLS media ciphertext integrity check failed");
  }
  const hasher = sha256.create();
  for (let offset = 0; offset < blob.size; offset += MEDIA_CHUNK_SIZE) {
    hasher.update(new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + MEDIA_CHUNK_SIZE)).arrayBuffer()));
  }
  const magic = new Uint8Array(await blob.slice(0, MEDIA_MAGIC.length).arrayBuffer());
  if (bytesToBase64Url(hasher.digest()) !== descriptor.ciphertextHash ||
    magic.length !== MEDIA_MAGIC.length ||
    !MEDIA_MAGIC.every((byte, index) => magic[index] === byte)) {
    throw new Error("MLS media ciphertext integrity check failed");
  }
  const keyBytes = base64UrlToBytes(descriptor.key, 32);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  wipe(keyBytes);
  const noncePrefix = base64UrlToBytes(descriptor.noncePrefix, 8);
  const plaintextParts = [];
  let offset = MEDIA_MAGIC.length;
  try {
    for (let index = 0; index < descriptor.chunks; index += 1) {
      const ciphertextLength = descriptor.chunkSize + 16;
      const chunk = new Uint8Array(await blob.slice(offset, offset + ciphertextLength).arrayBuffer());
      if (chunk.length !== ciphertextLength) throw new Error("Truncated MLS media ciphertext");
      const iv = new Uint8Array(12);
      iv.set(noncePrefix, 0);
      new DataView(iv.buffer).setUint32(8, index, false);
      const aad = textEncoder.encode(canonicalJson([
        "liotan-mls-media-chunk-v1",
        descriptor.conversationId,
        descriptor.messageId,
        descriptor.bindingId,
        index,
        descriptor.chunks
      ]));
      plaintextParts.push(new Uint8Array(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, chunk)
      ));
      offset += ciphertextLength;
    }
    if (offset !== blob.size) throw new Error("Unexpected MLS media trailing data");
    return new Blob(plaintextParts, { type: descriptor.original.mimeType || "application/octet-stream" })
      .slice(0, originalSize, descriptor.original.mimeType || "application/octet-stream");
  } finally {
    wipe(noncePrefix);
    plaintextParts.forEach(wipe);
  }
}
