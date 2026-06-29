const {
  hmac,
  hashSocketIp
} = require("../../utils/securityIds");

const buckets =
  new Map();

const connectionBuckets =
  new Map();

const DEFAULT_LIMIT = {
  windowMs: 60 * 1000,
  max: 90
};

const EVENT_LIMITS = {
  sendMessage: {
    windowMs: 60 * 1000,
    max: 18
  },
  sendGroupMessage: {
    windowMs: 60 * 1000,
    max: 18
  },
  typing: {
    windowMs: 10 * 1000,
    max: 12
  },
  stopTyping: {
    windowMs: 10 * 1000,
    max: 12
  },
  markChatRead: {
    windowMs: 30 * 1000,
    max: 40
  },
  editMessage: {
    windowMs: 60 * 1000,
    max: 12
  },
  deleteMessage: {
    windowMs: 60 * 1000,
    max: 12
  },
  deleteChat: {
    windowMs: 60 * 1000,
    max: 5
  },
  pinMessage: {
    windowMs: 60 * 1000,
    max: 12
  },
  getChat: {
    windowMs: 60 * 1000,
    max: 25
  },
  getGroupChat: {
    windowMs: 60 * 1000,
    max: 25
  },
  joinGroup: {
    windowMs: 60 * 1000,
    max: 20
  },
  callOffer: {
    windowMs: 60 * 1000,
    max: 10
  },
  callAnswer: {
    windowMs: 60 * 1000,
    max: 10
  },
  callIceCandidate: {
    windowMs: 10 * 1000,
    max: 40
  },
  callEnd: {
    windowMs: 60 * 1000,
    max: 10
  }
};

function getLimit(eventName) {
  return EVENT_LIMITS[eventName] ||
    DEFAULT_LIMIT;
}

function cleanupBuckets() {
  const now =
    Date.now();

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

setInterval(
  cleanupBuckets,
  60 * 1000
).unref?.();

function consumeBucket({
  map,
  key,
  windowMs,
  max
}) {
  const now =
    Date.now();

  const current =
    map.get(key);

  if (
    !current ||
    current.expiresAt <= now
  ) {
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
    max:
      process.env.NODE_ENV === "production"
        ? 5
        : 50
  });
}

function isRateLimited({
  socket,
  username,
  eventName
}) {
  const limit =
    getLimit(eventName);

  const key =
    `${hmac(username)}:${hashSocketIp(socket)}:${eventName}`;

  return consumeBucket({
    map: buckets,
    key,
    windowMs: limit.windowMs,
    max: limit.max
  });
}

function attachSocketRateLimit(socket) {
  const originalOn =
    socket.on.bind(socket);

  socket.on = (
    eventName,
    handler
  ) => {
    if (
      typeof handler !== "function" ||
      eventName === "disconnect" ||
      eventName === "error"
    ) {
      return originalOn(
        eventName,
        handler
      );
    }

    return originalOn(
      eventName,
      async (...args) => {
        const username =
          socket.user?.username ||
          socket.id;

        if (
          isRateLimited({
            socket,
            username,
            eventName
          })
        ) {
          socket.emit(
            "rateLimited",
            {
              event: eventName,
              message: "too many realtime actions"
            }
          );

          return;
        }

        return handler(...args);
      }
    );
  };
}

module.exports = {
  attachSocketRateLimit,
  isRateLimited,
  isConnectionRateLimited
};
