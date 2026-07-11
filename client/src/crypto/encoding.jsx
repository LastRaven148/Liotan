import { sha256 } from "@noble/hashes/sha2.js";

export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function bytesToBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value, expectedLength = 0) {
  const input = String(value || "");
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new TypeError("Invalid base64url value");
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (expectedLength && bytes.length !== expectedLength) throw new TypeError("Invalid byte length");
  return bytes;
}

function normalize(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite canonical JSON number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(item => normalize(item, seen));
  if (!value || typeof value !== "object") throw new TypeError("Unsupported canonical JSON value");
  if (seen.has(value)) throw new TypeError("Cyclic canonical JSON value");
  seen.add(value);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined || typeof item === "function" || typeof item === "symbol") {
      throw new TypeError("Unsupported canonical JSON property");
    }
    result[key] = normalize(item, seen);
  }
  seen.delete(value);
  return result;
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function sha256Base64Url(value) {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  return bytesToBase64Url(sha256(bytes));
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function randomId(length = 24) {
  return bytesToBase64Url(randomBytes(length));
}

export function wipe(bytes) {
  bytes?.fill?.(0);
}
