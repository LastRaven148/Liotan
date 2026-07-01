const {
  hmac,
  hashSocketIp
} = require("../../utils/securityIds");

const logger = require("../../utils/logger");

const buckets = new Map();
const connectionBuckets = new Map();

const DEFAULT_LIMIT = {
  windowMs: 60 * 1000,
  max: 90,
  maxPayloadBytes: 32 * 1024
};

const EVENT_LIMITS = {
  sendMessage: {
    windowMs: 60 * 1000,
    max: 18,
    maxPayloadBytes: 64 * 1024
  },
  sendGroupMessage: {
    windowMs: 60 * 1000,
    max: 18,
    maxPayloadBytes: 64 * 1024
  },
  typing: {
    windowMs: 10 * 1000,
    max: 12,
    maxPayloadBytes: 1024
  },
  stopTyping: {
    windowMs: 10 * 1000,
    max: 12,
    maxPayloadBytes: 1024
  },
  markChatRead: {
    windowMs: 30 * 1000,
    max: 40,
    maxPayloadBytes: 8 * 1024
  },
  editMessage: {
    windowMs: 60 * 1000,
    max: 12,
    maxPayloadBytes: 32 * 1024
  },
  deleteMessage: {
    windowMs: 60 * 1000,
    max: 12,
    maxPayloadBytes: 8 * 1024
  },
  deleteChat: {
    windowMs: 60 * 1000,
    max: 5,
    maxPayloadBytes: 4 * 1024
  },
  pinMessage: {
    windowMs: 60 * 1000,
    max: 12,
    maxPayloadBytes: 8 * 1024
  },
  getChat: {
    windowMs: 60 * 1000,
    max: 25,
    maxPayloadBytes: 8 * 1024
  },
  getGroupChat: {
    windowMs: 60 * 1000,
    max: 25,
    maxPayloadBytes: 8 * 1024
  },
  joinGroup: {
    windowMs: 60 * 1000,
    max: 20,
    maxPayloadBytes: 4 * 1024
  },
  callOffer: {
    windowMs: 60 * 1000,
    max: 10,
    maxPayloadBytes: 128 * 1024
  },
  callAnswer: {
    windowMs: 60 * 1000,
    max: 10,
    maxPayloadBytes: 128 * 1024
  },
  callIceCandidate: {
    windowMs: 10 * 1000,
    max: 40,
    maxPayloadBytes: 32 * 1024
  },
  callEnd: {
    windowMs: 60 * 1000,
    max: 10,
    maxPayloadBytes: 4 * 1024
  }
};

function getLimit(eventName) {
  return EVENT_LIMITS[eventName] || DEFAULT_LIMIT;
}

function cleanupBuckets() {
  const now = Date.now();

  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) {
      buckets.delete(key);
    }
  }

  for (const [key, bucket] of connectionBuckets) {
    if (bucket.expiresAt <= now) {
      connectionBuckets.delete(key);
    }
  }
}

setInterval(cleanupBuckets, 60 * 1000).unref?.();

function consumeBucket({ map, key, windowMs, max }) {
  const now = Date.now();
  const current = map.get(key);

  if (!current || current.expiresAt <= now) {
    map.set(key, {
      count: 1,
      expiresAt: now + windowMs
    });

    return false;
  }

  current.count += 1;

  return current.count > max;
}

function isConnectionRateLimited(socket) {
  return consumeBucket({
    map: connectionBuckets,
    key: hashSocketIp(socket),
    windowMs: 1000,
    max: process.env.NODE_ENV === "production" ? 5 : 50
  });
}

function isRateLimited({ socket, username, eventName }) {
  const limit = getLimit(eventName);
  const key = `${hmac(username)}:${hashSocketIp(socket)}:${eventName}`;

  return consumeBucket({
    map: buckets,
    key,
    windowMs: limit.windowMs,
    max: limit.max
  });
}

function estimatePayloadBytes(args) {
  try {
    return Buffer.byteLength(JSON.stringify(args || []), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isPayloadTooLarge(eventName, args) {
  const limit = getLimit(eventName);
  return estimatePayloadBytes(args) > limit.maxPayloadBytes;
}

function attachSocketRateLimit(socket) {
  const originalOn = socket.on.bind(socket);

  socket.on = (eventName, handler) => {
    if (
      typeof handler !== "function" ||
      eventName === "disconnect" ||
      eventName === "error"
    ) {
      return originalOn(eventName, handler);
    }

    return originalOn(eventName, async (...args) => {
      const username = socket.user?.username || socket.id;

      if (isPayloadTooLarge(eventName, args)) {
        logger.warn("socket payload rejected", {
          username: socket.user?.username || null,
          eventName,
          socketId: socket.id
        });

        socket.emit("rateLimited", {
          event: eventName,
          message: "realtime payload too large"
        });

        return;
      }

      if (isRateLimited({ socket, username, eventName })) {
        logger.warn("socket event rate limited", {
          username: socket.user?.username || null,
          eventName,
          socketId: socket.id
        });

        socket.emit("rateLimited", {
          event: eventName,
          message: "too many realtime actions"
        });

        return;
      }

      try {
        return await handler(...args);
      } catch (err) {
        logger.error("socket handler failed", err, {
          username: socket.user?.username || null,
          eventName,
          socketId: socket.id
        });

        socket.emit("serverError", {
          event: eventName,
          message: "realtime action failed"
        });
      }
    });
  };
}

module.exports = {
  attachSocketRateLimit,
  isRateLimited,
  isConnectionRateLimited
};
