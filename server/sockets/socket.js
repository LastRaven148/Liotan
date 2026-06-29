const jwt =
  require("jsonwebtoken");

const User =
  require("../models/User");

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

const registerGroupHandlers =
  require("./handlers/group");

const registerCallHandlers =
  require("./handlers/calls");

const {
  attachSocketRateLimit,
  isConnectionRateLimited
} = require("./middleware/socketRateLimit");

const logger =
  require("../utils/logger");

function setupSocket(io) {

  io.use((socket, next) => {

    try {

      if (isConnectionRateLimited(socket)) {
        return next(
          new Error("too many socket connections")
        );
      }

      const token =
        socket.handshake.auth?.token;

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET,
          {
            algorithms: ["HS256"]
          }
        );

      if (
        !decoded.userId ||
        !decoded.username
      ) {
        return next(
          new Error("invalid token")
        );
      }

      User.exists({
        _id: decoded.userId,
        username: decoded.username,
        emailVerified: true
      }).then(exists => {
        if (!exists) {
          return next(
            new Error("account deleted")
          );
        }

        socket.user =
          decoded;

        next();
      }).catch(next);

    } catch (err) {

      logger.warn(
        "SOCKET AUTH FAILED",
        { message: err.message }
      );

      next(
        new Error("auth error")
      );

    }

  });

  io.on(
    "connection",
    async (socket) => {

      attachSocketRateLimit(socket);

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

registerGroupHandlers({
  io,
  socket
});

      registerCallHandlers({
        io,
        socket
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