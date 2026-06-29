const VOICE_MAGIC = "LIOTAN_VOICE_E2EE_V1";
const VOICE_KDF_INFO = "liotan voice message v1";

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function wipe(value) {
  if (value instanceof Uint8Array) {
    crypto.getRandomValues(value);
    value.fill(0);
  }
}

async function importRawKey(keyBytes) {
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    "HKDF",
    false,
    ["deriveKey"]
  );
}

async function deriveVoiceAesKey(masterKeyBytes, salt) {
  const hkdfKey = await importRawKey(masterKeyBytes);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(VOICE_KDF_INFO)
    },
    hkdfKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVoiceBlob(blob, masterKeyBytes, metadata = {}) {
  if (!(masterKeyBytes instanceof Uint8Array) || masterKeyBytes.length < 32) {
    throw new Error("voice encryption key is missing");
  }

  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = await deriveVoiceAesKey(masterKeyBytes, salt);
  const plain = new Uint8Array(await blob.arrayBuffer());

  const associatedData = new TextEncoder().encode(JSON.stringify({
    magic: VOICE_MAGIC,
    mime: blob.type || "audio/webm",
    durationMs: Number(metadata.durationMs || 0),
    createdAt: Date.now()
  }));

  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: associatedData,
      tagLength: 128
    },
    key,
    plain
  ));

  wipe(plain);

  return {
    blob: new Blob([encrypted], {
      type: "application/octet-stream"
    }),
    envelope: {
      version: 1,
      magic: VOICE_MAGIC,
      alg: "AES-256-GCM+HKDF-SHA256",
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ad: bytesToBase64(associatedData),
      originalMime: blob.type || "audio/webm",
      durationMs: Number(metadata.durationMs || 0)
    }
  };
}

export async function decryptVoiceBlob(encryptedBlob, masterKeyBytes, envelope) {
  if (!envelope || envelope.magic !== VOICE_MAGIC) {
    throw new Error("invalid voice envelope");
  }

  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const associatedData = base64ToBytes(envelope.ad);
  const key = await deriveVoiceAesKey(masterKeyBytes, salt);
  const cipher = new Uint8Array(await encryptedBlob.arrayBuffer());

  const plain = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: associatedData,
      tagLength: 128
    },
    key,
    cipher
  ));

  wipe(cipher);

  return new Blob([plain], {
    type: envelope.originalMime || "audio/webm"
  });
}

export function getVoiceSecurityPolicy() {
  return Object.freeze({
    recording: "server-disabled",
    uploadFormat: "encrypted-binary-only",
    serverPlaintextAccess: false,
    maxUnencryptedLifetime: "memory-only-before-upload",
    codecRecommendation: "opus",
    envelope: VOICE_MAGIC
  });
}
