"use strict";

// Compatibility registration for deployments that still import this module.
// No legacy payload is parsed or persisted.
module.exports = function registerSendGroupMessage({ socket }) {
  socket.on("sendGroupMessage", (_data, ack) => {
    if (typeof ack === "function") {
      ack({ ok: false, error: "mls-v4-required", protocol: "mls-1.0" });
    }
  });
};
