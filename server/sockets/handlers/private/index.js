const registerGetPrivateChat =
  require("./getPrivateChat");

const registerSendPrivateMessage =
  require("./sendPrivateMessage");

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

  registerSendPrivateMessage({
    io,
    socket,
    emitStopTyping
  });

  registerMarkPrivateChatRead({
    io,
    socket
  });

  registerEditMessage({
    io,
    socket
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