const crypto =
  require("crypto");

const buckets =
  new Map();

const DEFAULT_LIMIT = {
  windowMs: 60 * 1000,
  max: 120
};

const EVENT_LIMITS = {
  sendMessage: {
    windowMs: 60 * 1000,
    max: 24
  },
  sendGroupMessage: {
    windowMs: 60 * 1000,
    max: 24
  },
  typing: {
    windowMs: 10 * 1000,
    max: 25
  },
  stopTyping: {
    windowMs: 10 * 1000,
    max: 25
  },
  messageRead: {
    windowMs: 30 * 1000,
    max: 60
  },
  chatRead: {
    windowMs: 30 * 1000,
    max: 60
  },
  editMessage: {
    windowMs: 60 * 1000,
    max: 20
  },
  deleteMessage: {
    windowMs: 60 * 1000,
    max: 20
  },
  deleteChat: {
    windowMs: 60 * 1000,
    max: 8
  },
  pinMessage: {
    windowMs: 60 * 1000,
    max: 20
  },
  getChat: {
    windowMs: 60 * 1000,
    max: 40
  },
  getGroupChat: {
    windowMs: 60 * 1000,
    max: 40
  },
  joinChat: {
    windowMs: 60 * 1000,
    max: 40
  },
  joinGroup: {
    windowMs: 60 * 1000,
    max: 40
  }
};

function hashKey(value) {
  const secret =
    process.env.PRIVACY_HASH_SECRET ||
    process.env.JWT_SECRET ||
    "liotan-local-dev";

  return crypto
    .createHmac("sha256", secret)
    .update(String(value || "anonymous"))
    .digest("hex");
}

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
}

setInterval(
  cleanupBuckets,
  60 * 1000
).unref?.();

function isRateLimited({
  username,
  eventName
}) {
  const limit =
    getLimit(eventName);

  const key =
    `${hashKey(username)}:${eventName}`;

  const now =
    Date.now();

  const current =
    buckets.get(key);

  if (
    !current ||
    current.expiresAt <= now
  ) {
    buckets.set(key, {
      count: 1,
      expiresAt:
        now + limit.windowMs
    });

    return false;
  }

  current.count += 1;

  if (current.count > limit.max) {
    return true;
  }

  return false;
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
  isRateLimited
};
