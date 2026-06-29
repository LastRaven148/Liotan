const realtimeFeatures = {
  calls: {
    enabled: true,
    transport: "webrtc",
    signaling: "socket.io-authenticated",
    mediaEncryption: "dtls-srtp-required",
    applicationE2EE: "insertable-streams-sframe-prepared",
    frameLifetime: "ephemeral-20ms-opus-frames",
    persistentCallLogs: false,
    targetStored: false,
    recording: "disabled",
    serverMediaAccess: "forbidden",
    relayMode: "turn-relay-only-optional"
  },
  voiceMessages: {
    enabled: true,
    maxDurationSeconds: 300,
    encryption: "client-side-aes-gcm-required-before-upload",
    serverPlaintextAccess: "forbidden"
  },
  proxyTransport: {
    enabled: false,
    mode: "liotan-relay",
    messageAccess: "ciphertext-only",
    publicRelays: []
  }
};

module.exports = realtimeFeatures;
