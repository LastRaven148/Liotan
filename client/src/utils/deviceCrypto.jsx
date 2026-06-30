const DEVICE_KEY_PAIR_KEY =
  "liotan_device_key_pair_v1";

function bufferToBase64Url(buffer) {
  const bytes =
    new Uint8Array(buffer);

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
  const normalized =
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const padded =
    normalized.padEnd(
      normalized.length + ((4 - normalized.length % 4) % 4),
      "="
    );

  const binary =
    atob(padded);

  const bytes =
    new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function exportKey(key) {
  return crypto.subtle.exportKey(
    "jwk",
    key
  );
}

async function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
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
  const pair =
    await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256"
      },
      true,
      ["deriveKey", "deriveBits"]
    );

  const publicKey =
    await exportKey(pair.publicKey);

  const privateKey =
    await exportKey(pair.privateKey);

  const stored = {
    publicKey,
    privateKey,
    createdAt: new Date().toISOString()
  };

  localStorage.setItem(
    DEVICE_KEY_PAIR_KEY,
    JSON.stringify(stored)
  );

  return stored;
}

async function getStoredPair() {
  try {
    const raw =
      localStorage.getItem(
        DEVICE_KEY_PAIR_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      parsed?.publicKey?.kty !== "EC" ||
      parsed?.privateKey?.kty !== "EC"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function getDevicePublicKey() {
  const pair =
    await getStoredPair() ||
    await createPair();

  return pair.publicKey;
}

export async function resetDeviceKeyPair() {
  localStorage.removeItem(
    DEVICE_KEY_PAIR_KEY
  );

  return createPair();
}

export async function getDeviceKeyFingerprint() {
  const publicKey =
    await getDevicePublicKey();

  const encoded =
    new TextEncoder().encode(
      JSON.stringify({
        crv: publicKey.crv,
        kty: publicKey.kty,
        x: publicKey.x,
        y: publicKey.y
      })
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded
    );

  return bufferToBase64Url(digest)
    .slice(0, 24);
}

export async function getDevicePrivateKey() {
  const pair =
    await getStoredPair() ||
    await createPair();

  return importPrivateKey(
    pair.privateKey
  );
}

export async function importDevicePublicKey(publicKey) {
  return importPublicKey(
    publicKey
  );
}

export {
  bufferToBase64Url,
  base64UrlToBuffer
};
