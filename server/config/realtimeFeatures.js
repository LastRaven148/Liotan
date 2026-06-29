const realtimeFeatures = {
  calls: {
    enabled: false,
    transport: "webrtc",
    signaling: "socket.io-authenticated",
    mediaEncryption: "dtls-srtp-required",
    applicationE2EE: "planned-sframe-insertable-streams",
    recording: "disabled",
    serverMediaAccess: "forbidden",
    relayMode: "turn-relay-only-optional"
  },
  voiceMessages: {
    enabled: false,
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
