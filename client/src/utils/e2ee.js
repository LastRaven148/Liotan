const E2EE_PREFIX = "__LIOTAN_E2EE_V1__";
const E2EE_ITERATIONS = 200000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

function safeChatKey(username, chatKey) {
  return encodeURIComponent(`${username || ""}:${chatKey || ""}`);
}

export function getE2EEStorageKey(username, chatKey) {
  return `liotan:e2ee-secret:${safeChatKey(username, chatKey)}`;
}

export function getChatSecret(username, chatKey) {
  if (!username || !chatKey) {
    return "";
  }

  return localStorage.getItem(
    getE2EEStorageKey(username, chatKey)
  ) || "";
}

export function hasChatSecret(username, chatKey) {
  return Boolean(getChatSecret(username, chatKey));
}

export function setChatSecret(username, chatKey, secret) {
  if (!username || !chatKey) {
    return;
  }

  const key = getE2EEStorageKey(username, chatKey);
  const cleanSecret = String(secret || "").trim();

  if (!cleanSecret) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, cleanSecret);
  }

  window.dispatchEvent(
    new CustomEvent("liotan:e2ee-updated", {
      detail: {
        username,
        chatKey,
        enabled: Boolean(cleanSecret)
      }
    })
  );
}

export function isEncryptedText(value) {
  return (
    typeof value === "string" &&
    value.startsWith(E2EE_PREFIX)
  );
}

async function deriveKey(secret, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: E2EE_ITERATIONS,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptTextForChat({
  username,
  chatKey,
  text
}) {
  if (!text || isEncryptedText(text)) {
    return text || "";
  }

  const secret = getChatSecret(username, chatKey);

  if (!secret) {
    return text;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encoder.encode(text)
  );

  const payload = {
    v: 1,
    alg: "AES-GCM-256",
    kdf: "PBKDF2-SHA256",
    iter: E2EE_ITERATIONS,
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

  const secret = getChatSecret(username, chatKey);

  if (!secret) {
    return "🔒 Зашифрованное сообщение. Включите ключ этого чата.";
  }

  try {
    const payload = JSON.parse(
      atob(text.slice(E2EE_PREFIX.length))
    );

    if (payload?.v !== 1) {
      throw new Error("Unsupported E2EE version");
    }

    const salt = fromBase64(payload.salt);
    const iv = fromBase64(payload.iv);
    const ct = fromBase64(payload.ct);
    const key = await deriveKey(secret, salt);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      ct
    );

    return decoder.decode(decrypted);
  } catch (err) {
    console.error("E2EE decrypt failed", err);
    return "🔒 Не удалось расшифровать сообщение. Проверьте ключ чата.";
  }
}
