const jwt =
  require("jsonwebtoken");

const {
  registerTypingHandlers,
  emitStopTyping,
  clearUserTyping
} = require("./handlers/typingHandlers");

const {
  handleConnectionStart,
  handleConnectionEnd
} = require("./handlers/connectionHandlers");

const registerPrivateHandlers =
  require("./handlers/private");

function setupSocket(io) {

  io.use((socket, next) => {

    try {

      const token =
        socket.handshake.auth?.token;

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );

      if (
        !decoded.userId ||
        !decoded.username
      ) {
        return next(
          new Error("invalid token")
        );
      }

      socket.user =
        decoded;

      next();

    } catch (err) {

      console.log(
        "AUTH FAILED:",
        err.message
      );

      next(
        new Error("auth error")
      );

    }

  });

  io.on(
    "connection",
    async (socket) => {

      await handleConnectionStart({
        io,
        socket
      });

      registerTypingHandlers({
        io,
        socket
      });

      registerPrivateHandlers({
        io,
        socket,
        emitStopTyping
      });

      socket.on(
        "disconnect",
        () => {
          handleConnectionEnd({
            io,
            socket,
            clearUserTyping
          });
        }
      );

    }
  );

}

module.exports =
  setupSocket;