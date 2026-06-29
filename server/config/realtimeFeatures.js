const realtimeFeatures = {
  calls: {
    enabled: false,
    transport: "webrtc",
    signaling: "socket.io",
    encryption: "planned-e2ee-sframe"
  },
  voiceMessages: {
    enabled: false,
    maxDurationSeconds: 300,
    encryption: "planned-client-side-aes-gcm"
  },
  proxyTransport: {
    enabled: false,
    mode: "liotan-relay",
    publicRelays: []
  }
};

module.exports = realtimeFeatures;
