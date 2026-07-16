function registerGetGroupChat({ socket }) {
  socket.on("getGroupChat", (_payload, ack) => {
    if (typeof ack === "function") ack({
      ok: false,
      error: "mls-v4-required",
      protocol: "mls-1.0"
    });
  });
}

module.exports = registerGetGroupChat;
