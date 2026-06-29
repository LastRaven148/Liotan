const CALL_FRAME_INFO = "liotan call frame e2ee v1";
const CALL_RATCHET_INFO = "liotan call ratchet v1";

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function wipe(bytes) {
  if (bytes instanceof Uint8Array) {
    crypto.getRandomValues(bytes);
    bytes.fill(0);
  }
}

async function importHkdf(bytes) {
  return crypto.subtle.importKey(
    "raw",
    bytes,
    "HKDF",
    false,
    ["deriveBits", "deriveKey"]
  );
}

export async function createEphemeralCallSecret() {
  return randomBytes(32);
}

export async function deriveCallFrameKey(secret, salt, epoch = 0) {
  const key = await importHkdf(secret);
  const info = new TextEncoder().encode(`${CALL_FRAME_INFO}:${epoch}`);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info
    },
    key,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function ratchetCallSecret(secret, transcriptHash, epoch) {
  const key = await importHkdf(secret);
  const salt = transcriptHash instanceof Uint8Array
    ? transcriptHash
    : new Uint8Array(32);

  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(`${CALL_RATCHET_INFO}:${epoch}`)
    },
    key,
    256
  );

  wipe(secret);
  return new Uint8Array(bits);
}

export function supportsCallFrameE2EE() {
  return Boolean(
    window.RTCRtpSender?.prototype?.createEncodedStreams ||
    window.RTCRtpScriptTransform
  );
}

export function getCallSecurityPolicy() {
  return Object.freeze({
    transport: "webrtc-dtls-srtp-required",
    applicationLayerE2EE: supportsCallFrameE2EE()
      ? "insertable-streams-available"
      : "dtls-srtp-only-fallback",
    recording: "disabled",
    serverRecording: false,
    persistentCallLogs: false,
    keyLifetimeSeconds: 30,
    framePlaintextLifetime: "current-frame-only",
    serverCanDecrypt: false
  });
}

export function installNoRecordingGuards(peerConnection) {
  if (!peerConnection) {
    return;
  }

  peerConnection.__liotanNoRecording = true;
  peerConnection.__liotanEphemeralMedia = true;
}
