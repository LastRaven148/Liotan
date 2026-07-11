import { ClientId, ConversationId, DeviceId, Uuid } from "@wireapp/core-crypto/browser";
import { base64UrlToBytes, textEncoder } from "../encoding";

export function clientIdText(clientId) {
  const value = clientId.deserialize();
  return `${value.userId.toString()}:${value.deviceId.toHexString()}@${value.domain}`;
}

export function parseClientId(value) {
  const match = /^([0-9a-f-]{36}):([0-9a-f]{16})@([a-z0-9.-]+)$/i.exec(String(value || ""));
  if (!match) throw new TypeError("Invalid MLS client id");
  return new ClientId(new Uuid(match[1]), DeviceId.fromHexString(match[2]), match[3]);
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
