const registerGetPrivateChat =
  require("./getPrivateChat");

const registerMarkPrivateChatRead =
  require("./markPrivateChatRead");

const registerEditMessage =
  require("./editMessage");

const registerDeleteMessage =
  require("./deleteMessage");

const registerDeletePrivateChat =
  require("./deletePrivateChat");

const registerPinMessage =
  require("./pinMessage");

function registerPrivateHandlers({
  io,
  socket,
  emitStopTyping
}) {

  registerGetPrivateChat(socket);

  socket.on("sendMessage", (_data, ack) => {
    if (typeof ack === "function") ack({
      ok: false,
      error: "mls-v4-required",
      protocol: "mls-1.0"
    });
  });

  registerMarkPrivateChatRead({
    io,
    socket
  });

  socket.on("editMessage", (_data, ack) => {
    if (typeof ack === "function") ack({ ok: false, error: "mls-v4-control-event-required" });
  });

  registerDeleteMessage({
    io,
    socket
  });

  registerDeletePrivateChat({
    io,
    socket
  });

  registerPinMessage({
    io,
    socket
  });

}

module.exports =
  registerPrivateHandlers;
