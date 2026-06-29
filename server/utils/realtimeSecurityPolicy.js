const CALL_POLICY = Object.freeze({
  persistentCallLogs: false,
  serverRecording: false,
  serverMediaAccess: false,
  signalingPersistence: false,
  targetLogging: false,
  mediaTransport: "webrtc-dtls-srtp-required",
  applicationE2EE: "sframe-insertable-streams-prepared",
  keyRotationSeconds: 30,
  frameLifetime: "single-frame-memory-only",
  routeIdOnly: true
});

const VOICE_POLICY = Object.freeze({
  persistentPlaintext: false,
  serverPlaintextAccess: false,
  uploadMime: "application/octet-stream",
  requiredEnvelope: "LIOTAN_VOICE_E2EE_V1",
  encryption: "client-aes-256-gcm-hkdf-sha256-before-upload",
  maxDurationSeconds: 300,
  maxSizeBytes: 16 * 1024 * 1024
});

function noStoreHeaders(req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

function redactRealtimePayload(payload = {}) {
  const out = { ...payload };

  delete out.to;
  delete out.username;
  delete out.email;
  delete out.offer;
  delete out.answer;
  delete out.candidate;
  delete out.sdp;

  return out;
}

module.exports = {
  CALL_POLICY,
  VOICE_POLICY,
  noStoreHeaders,
  redactRealtimePayload
};
