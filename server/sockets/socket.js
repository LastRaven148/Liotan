const User = require("../models/User");

const {
  registerTypingHandlers,
  emitStopTyping,
  clearUserTyping
} = require("./handlers/typingHandlers");

const {
  handleConnectionStart,
  handleConnectionEnd
} = require("./handlers/connectionHandlers");

const registerPrivateHandlers = require("./handlers/private");
const registerGroupHandlers = require("./handlers/group");
const registerCallHandlers = require("./handlers/calls");

const {
  attachSocketRateLimit,
  isConnectionRateLimited
} = require("./middleware/socketRateLimit");

const logger = require("../utils/logger");
const privacy = require("../config/privacy");
const { getCallRoom } = require("../utils/callPrivacy");

const {
  isSessionActive,
  touchSession
} = require("../utils/sessionSecurity");

const {
  verifyAuthToken
} = require("../utils/authToken");

const {
  getAuthCookie
} = require("../utils/authCookie");

function setupSocket(io) {
  io.use((socket, next) => {
    try {
      if (isConnectionRateLimited(socket)) {
        return next(new Error("too many socket connections"));
      }

      const decoded = verifyAuthToken(
        socket.handshake.auth?.token ||
        getAuthCookie(socket.handshake)
      );

      if (!decoded) {
        return next(new Error("invalid token"));
      }

      Promise.all([
        User.exists({
          _id: decoded.userId,
          username: decoded.username,
          emailVerified: true
        }),
        isSessionActive({
          userId: decoded.userId,
          username: decoded.username,
          sessionId: decoded.sid
        })
      ]).then(async ([exists, sessionOk]) => {
        if (!exists) {
          return next(new Error("account deleted"));
        }

        if (!sessionOk) {
          return next(new Error("session expired"));
        }

        await touchSession(decoded.sid);

        socket.user = decoded;

        const callRoom = getCallRoom(decoded.username);

        if (callRoom) {
          socket.join(callRoom);
        }

        next();
      }).catch(next);
    } catch (err) {
      logger.warn("socket auth failed", {
        reason: err.name || "auth_error",
        ...(privacy.minimalLogs ? {} : { socketId: socket.id })
      });

      next(new Error("auth error"));
    }
  });

  io.on("connection", async (socket) => {
    attachSocketRateLimit(socket);

    try {
      await handleConnectionStart({
        io,
        socket
      });
    } catch (err) {
      logger.error("socket connection start failed", err, {
        ...(privacy.logUserHandle && socket.user?.username ? { username: socket.user.username } : {}),
        ...(privacy.minimalLogs ? {} : { socketId: socket.id })
      });

      socket.disconnect(true);
      return;
    }

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

    socket.on("disconnect", () => {
      handleConnectionEnd({
        io,
        socket,
        clearUserTyping
      });
    });
  });
}

module.exports = setupSocket;
