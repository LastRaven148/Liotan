import { buildApiUrlForEndpoint, getActiveApiUrl } from "../config/api";
import { bytesToBase64Url, canonicalJson, randomId, sha256Base64Url, textEncoder } from "./encoding";
import { signCanonical } from "./accountKeys";

let signer = null;

export function configureCryptoSigner(value) {
  signer = value;
}

async function readResponse(response) {
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.text();
}

async function checkedFetch(path, options) {
  const response = await fetch(buildApiUrlForEndpoint(path, getActiveApiUrl()), {
    ...options,
    credentials: "include",
    cache: "no-store"
  });
  if (options.raw && response.ok) return response;
  const data = await readResponse(response);
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `Crypto request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function cryptoBootstrap(deviceId = "") {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  return checkedFetch(`/crypto/v4/bootstrap${query}`, { method: "GET" });
}

export function unsignedCryptoPost(path, body) {
  return checkedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Liotan-CSRF": "liotan-browser-request-v1" },
    body: JSON.stringify(body)
  });
}

export async function signedCryptoRequest(path, {
  method = "GET",
  body = {},
  formData = null,
  raw = false,
  signal,
  headers: extraHeaders = {}
} = {}) {
  if (!signer?.deviceId || !signer?.requestSecretKey) throw new Error("Crypto device is locked");
  const normalizedMethod = String(method).toUpperCase();
  const timestamp = Date.now();
  const nonce = randomId(24);
  const bodyHash = sha256Base64Url(canonicalJson(body));
  const authVersion = Number(signer.authVersion) === 2 ? 2 : 1;
  const value = authVersion === 2
    ? {
        v: 2,
        action: "crypto-request",
        protocol: "liotan-device-auth-v2",
        method: normalizedMethod,
        path,
        timestamp,
        nonce,
        bodyHash,
        deviceId: signer.deviceId,
        sessionBindingId: signer.sessionBindingId
      }
    : { method: normalizedMethod, path, timestamp, nonce, bodyHash };
  const signature = await signCanonical(
    signer.requestSecretKey,
    authVersion === 2 ? "liotan-crypto-request-v2" : "liotan-crypto-request-v1",
    value
  );
  const headers = new Headers(extraHeaders);
  headers.set("X-Liotan-CSRF", "liotan-browser-request-v1");
  headers.set("X-Liotan-Crypto-Device", signer.deviceId);
  headers.set("X-Liotan-Crypto-Timestamp", String(timestamp));
  headers.set("X-Liotan-Crypto-Nonce", nonce);
  headers.set("X-Liotan-Crypto-Signature", signature);
  let requestBody;
  if (formData) {
    // Security metadata exists only in this signed canonical header. Multipart
    // carries ciphertext bytes, never a second attacker-controlled copy of the
    // authorization fields.
    headers.set("X-Liotan-Crypto-Body", bytesToBase64Url(textEncoder.encode(canonicalJson(body))));
    requestBody = formData;
  } else if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }
  return checkedFetch(path, { method: normalizedMethod, headers, body: requestBody, raw, signal });
}
