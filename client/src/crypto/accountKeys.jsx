import * as ed from "@noble/ed25519";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { base64UrlToBytes, bytesToBase64Url, canonicalJson, textEncoder } from "./encoding";

ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async message => sha512(message);

function derive(recoveryBytes, cryptoUserId, label, deviceId = "") {
  const salt = sha256(textEncoder.encode(`liotan-v4:${cryptoUserId}`));
  return hkdf(sha256, recoveryBytes, salt, textEncoder.encode(`${label}:${deviceId}`), 32);
}

export async function deriveAccountKeys(encodedRecoveryKey, cryptoUserId, deviceId) {
  const recoveryBytes = base64UrlToBytes(encodedRecoveryKey, 32);
  try {
    const rootSecretKey = derive(recoveryBytes, cryptoUserId, "account-root");
    const requestSecretKey = derive(recoveryBytes, cryptoUserId, "device-request", deviceId);
    const databaseKey = derive(recoveryBytes, cryptoUserId, "corecrypto-database", deviceId);
    const cacheKey = derive(recoveryBytes, cryptoUserId, "local-message-cache", deviceId);
    return {
      rootSecretKey,
      rootPublicKey: await ed.getPublicKeyAsync(rootSecretKey),
      requestSecretKey,
      requestPublicKey: await ed.getPublicKeyAsync(requestSecretKey),
      databaseKey,
      cacheKey
    };
  } finally {
    recoveryBytes.fill(0);
  }
}

export async function signCanonical(secretKey, domain, value) {
  const message = textEncoder.encode(canonicalJson([domain, value]));
  return bytesToBase64Url(await ed.signAsync(message, secretKey));
}

export async function verifyCanonical(publicKey, signature, domain, value) {
  try {
    return await ed.verifyAsync(
      base64UrlToBytes(signature, 64),
      textEncoder.encode(canonicalJson([domain, value])),
      base64UrlToBytes(publicKey, 32),
      { zip215: false }
    );
  } catch {
    return false;
  }
}
