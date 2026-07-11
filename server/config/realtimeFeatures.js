const { CALL_POLICY, VOICE_POLICY } = require("../utils/realtimeSecurityPolicy");

const realtimeFeatures = {
  calls: {
    enabled: false,
    transport: "webrtc",
    signaling: "socket.io-authenticated",
    mediaEncryption: "dtls-srtp-required",
    applicationE2EE: "disabled-until-mls-authenticated-call-protocol-audit",
    persistentCallLogs: CALL_POLICY.persistentCallLogs,
    targetStored: false,
    targetLogging: CALL_POLICY.targetLogging,
    recording: "disabled",
    serverMediaAccess: "forbidden",
    keyRotationSeconds: CALL_POLICY.keyRotationSeconds,
    frameLifetime: CALL_POLICY.frameLifetime
  },
  voiceMessages: {
    enabled: true,
    maxDurationSeconds: VOICE_POLICY.maxDurationSeconds,
    maxSizeBytes: VOICE_POLICY.maxSizeBytes,
    requiredEnvelope: VOICE_POLICY.requiredEnvelope,
    encryption: VOICE_POLICY.encryption,
    serverPlaintextAccess: "forbidden"
  },
};

module.exports = realtimeFeatures;
