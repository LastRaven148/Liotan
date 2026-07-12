import { ClientId, ConversationId, DeviceId, Uuid } from "@wireapp/core-crypto/browser";
import { initializeCoreCryptoRuntime } from "../coreCryptoRuntime";
import { base64UrlToBytes, textEncoder } from "../encoding";
import { destroyUniffi } from "./uniffiLifecycle";

const CLIENT_ID_RE = /^([0-9a-f-]{36}):([0-9a-f]{16})@([a-z0-9.-]+)$/i;

function createClientId(userIdText, deviceIdHex, domain) {
  let userId = null;
  let deviceId = null;
  try {
    userId = new Uuid(userIdText);
    deviceId = DeviceId.fromHexString(deviceIdHex);
    return new ClientId(userId, deviceId, domain);
  } finally {
    destroyUniffi(deviceId);
    destroyUniffi(userId);
  }
}

export async function createInitializedClientIdentity({ cryptoUserId, deviceId, domain }) {
  await initializeCoreCryptoRuntime();
  const clientId = createClientId(cryptoUserId, deviceId, domain);
  try {
    return { clientId, clientIdString: clientIdText(clientId) };
  } catch (error) {
    destroyUniffi(clientId);
    throw error;
  }
}

export function clientIdText(clientId) {
  const value = clientId.deserialize();
  try {
    const text = `${value.userId.toString()}:${value.deviceId.toHexString()}@${value.domain}`;
    if (!CLIENT_ID_RE.test(text)) throw new TypeError("Invalid MLS client id");
    return text.toLowerCase();
  } finally {
    destroyUniffi(value.deviceId);
    destroyUniffi(value.userId);
  }
}

export function parseClientId(value) {
  const match = CLIENT_ID_RE.exec(String(value || ""));
  if (!match) throw new TypeError("Invalid MLS client id");
  return createClientId(match[1], match[2], match[3]);
}

export function conversationObject(conversationId) {
  return new ConversationId(base64UrlToBytes(conversationId, 32));
}

export function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeTextEqual(left, right) {
  const a = textEncoder.encode(String(left || ""));
  const b = textEncoder.encode(String(right || ""));
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
