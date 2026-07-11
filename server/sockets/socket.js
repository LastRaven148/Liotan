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
const realtimeFeatures = require("../config/realtimeFeatures");

const {
  isSessionActive,
  touchSession,
  hashSessionId
} = require("../utils/sessionSecurity");

const {
  configureSessionRegistry,
  sessionRoom,
  userRoom
} = require("./sessionRegistry");

const {
  verifyAuthToken
} = require("../utils/authToken");

const {
  getAuthCookie
} = require("../utils/authCookie");

function setupSocket(io) {
  configureSessionRegistry(io);
  io.use((socket, next) => {
    try {
      if (isConnectionRateLimited(socket)) {
        return next(new Error("too many socket connections"));
      }

      const decoded = verifyAuthToken(
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
        socket.join(sessionRoom(hashSessionId(decoded.sid)));
        socket.join(userRoom(decoded.userId));

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

    const validateLiveAuthorization = async () => {
      if (socket.user?.exp && Date.now() >= Number(socket.user.exp) * 1000) return false;
      const [exists, sessionOk] = await Promise.all([
        User.exists({
          _id: socket.user.userId,
          username: socket.user.username,
          emailVerified: true
        }),
        isSessionActive({
          userId: socket.user.userId,
          username: socket.user.username,
          sessionId: socket.user.sid
        })
      ]);
      return Boolean(exists && sessionOk);
    };

    socket.use(async (_packet, next) => {
      try {
        if (await validateLiveAuthorization()) return next();
      } catch {}
      socket.disconnect(true);
      next(new Error("session revoked"));
    });

    const authorizationTimer = setInterval(() => {
      validateLiveAuthorization()
        .then(ok => { if (!ok) socket.disconnect(true); })
        .catch(() => socket.disconnect(true));
    }, Math.max(5000, Number(process.env.SOCKET_AUTH_RECHECK_MS) || 15000));
    authorizationTimer.unref?.();

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

    if (realtimeFeatures.calls.enabled) {
      registerCallHandlers({ io, socket });
    }

    socket.on("disconnect", () => {
      clearInterval(authorizationTimer);
      handleConnectionEnd({
        io,
        socket,
        clearUserTyping
      }).catch(err => logger.error("socket connection end failed", err));
    });
  });
}

module.exports = setupSocket;
