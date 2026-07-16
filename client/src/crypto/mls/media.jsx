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
import { MEDIA_CHUNK_SIZE, MEDIA_CHUNK_SIZES, MEDIA_MAGIC } from "./constants";
import { mediaType, safeMediaMime } from "./envelope";

function selectChunkSize(size) {
  if (size <= 512 * 1024) return MEDIA_CHUNK_SIZES[0];
  if (size <= 8 * 1024 * 1024) return MEDIA_CHUNK_SIZES[1];
  return MEDIA_CHUNK_SIZE;
}

function reportProgress(callback, detail) {
  try {
    callback?.(detail);
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Media progress callback failed", error);
  }
}

function yieldToBrowser() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function createCiphertextSink(bindingId) {
  if (navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const name = `liotan-media-${bindingId}.ciphertext`;
      const handle = await root.getFileHandle(name, { create: true });
      const writable = await handle.createWritable({ keepExistingData: false });
      return {
        async write(bytes) { await writable.write(bytes); },
        async finish() {
          await writable.close();
          return handle.getFile();
        },
        async cleanup() {
          try { await writable.abort(); } catch {}
          try { await root.removeEntry(name); } catch {}
        }
      };
    } catch {
      // OPFS is an optimization, not a security dependency. Safari private
      // mode and constrained browsers may deny it, so retain a bounded Blob
      // fallback without weakening encryption.
    }
  }
  const parts = [];
  return {
    async write(bytes) { parts.push(new Uint8Array(bytes)); },
    async finish() {
      const blob = new Blob(parts, { type: "application/octet-stream" });
      parts.forEach(wipe);
      parts.length = 0;
      return blob;
    },
    async cleanup() {
      parts.forEach(wipe);
      parts.length = 0;
    }
  };
}

export async function encryptAndUploadMedia(state, file, clientMessageId, options = {}) {
  const keyBytes = randomBytes(32);
  const noncePrefix = randomBytes(8);
  const bindingId = randomId(24);
  const chunkSize = selectChunkSize(file.size);
  const chunks = Math.max(1, Math.ceil(file.size / chunkSize));
  const aesKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const sink = await createCiphertextSink(bindingId);
  await sink.write(MEDIA_MAGIC);
  const hasher = sha256.create().update(MEDIA_MAGIC);
  try {
    async function encryptChunk(index) {
      const start = index * chunkSize;
      const source = new Uint8Array(await file.slice(start, Math.min(file.size, start + chunkSize)).arrayBuffer());
      const plaintext = new Uint8Array(chunkSize);
      plaintext.set(source);
      wipe(source);
      try {
        for (let offset = Math.min(file.size - start, chunkSize); offset < chunkSize; offset += 65536) {
          crypto.getRandomValues(plaintext.subarray(offset, Math.min(chunkSize, offset + 65536)));
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
        return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, aesKey, plaintext));
      } finally {
        wipe(plaintext);
      }
    }

    for (let index = 0; index < chunks; index += 2) {
      const encryptedBatch = await Promise.all(
        [index, index + 1].filter(value => value < chunks).map(encryptChunk)
      );
      for (const encrypted of encryptedBatch) {
        try {
          hasher.update(encrypted);
          await sink.write(encrypted);
        } finally {
          wipe(encrypted);
        }
      }
      reportProgress(options.onProgress, {
        stage: "encrypting",
        completed: Math.min(index + encryptedBatch.length, chunks),
        total: chunks
      });
      if (index + encryptedBatch.length < chunks) await yieldToBrowser();
    }
    const ciphertextHash = bytesToBase64Url(hasher.digest());
    const blob = await sink.finish();
    const signingBody = {
      conversationId: state.conversationId,
      clientMessageId,
      bindingId,
      ciphertextHash,
      bytes: String(blob.size),
      version: "mls-media-1"
    };
    const formData = new FormData();
    formData.set("attachment", new File([blob], `${bindingId}.liotanmedia`, { type: "application/octet-stream" }));
    reportProgress(options.onProgress, { stage: "uploading", completed: 0, total: blob.size });
    const uploadRequest = options.uploadRequest || signedCryptoRequest;
    const upload = await uploadRequest("/crypto/v4/media/upload", {
      method: "POST",
      body: signingBody,
      formData,
      signal: options.signal
    });
    reportProgress(options.onProgress, { stage: "uploading", completed: blob.size, total: blob.size });
    return {
      descriptor: {
        v: 1,
        conversationId: state.conversationId,
        messageId: clientMessageId,
        uploadId: upload.uploadId,
        deleteToken: upload.uploadDeleteToken,
        bindingId,
        ciphertextHash,
        key: bytesToBase64Url(keyBytes),
        noncePrefix: bytesToBase64Url(noncePrefix),
        chunkSize,
        chunks,
        ciphertextBytes: blob.size,
        original: {
          name: String(file.name || "file").slice(0, 160),
          type: mediaType(file, options.originalTypeOverride),
          mimeType: safeMediaMime(file),
          size: file.size,
          duration: Number(options.privateMetadata?.duration) || 0,
          waveform: Array.isArray(options.privateMetadata?.waveform) ? options.privateMetadata.waveform.slice(0, 64) : [],
          width: Math.max(0, Math.min(16384, Math.trunc(Number(options.privateMetadata?.width) || 0))),
          height: Math.max(0, Math.min(16384, Math.trunc(Number(options.privateMetadata?.height) || 0)))
        }
      },
      commit: {
        uploadId: upload.uploadId,
        token: upload.uploadCommitToken
      }
    };
  } finally {
    await sink.cleanup();
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
  const chunkSize = Number(descriptor?.chunkSize);
  if (!descriptor || descriptor.v !== 1 || descriptor.uploadId !== attachment.uploadId ||
    !MEDIA_CHUNK_SIZES.includes(chunkSize)) {
    throw new Error("Invalid MLS media descriptor");
  }
  const originalSize = Number(descriptor.original?.size);
  const expectedChunks = Math.max(1, Math.ceil(originalSize / chunkSize));
  const expectedCiphertextBytes = MEDIA_MAGIC.length + expectedChunks * (chunkSize + 16);
  if (
    !Number.isSafeInteger(originalSize) || originalSize < 0 || originalSize > 100 * 1024 * 1024 ||
    descriptor.chunks !== expectedChunks ||
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
      const ciphertextLength = chunkSize + 16;
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
