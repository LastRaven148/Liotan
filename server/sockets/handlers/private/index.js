const registerGetPrivateChat =
  require("./getPrivateChat");

function registerPrivateHandlers({
  socket
}) {

  registerGetPrivateChat(socket);

  for (const event of ["sendMessage", "editMessage", "deleteMessage", "deleteChat", "pinMessage", "markChatRead"]) {
    socket.on(event, (_data, ack) => {
      if (typeof ack === "function") ack({
        ok: false,
        error: "mls-v4-required",
        protocol: "mls-1.0"
      });
    });
  }

}

module.exports =
  registerPrivateHandlers;
