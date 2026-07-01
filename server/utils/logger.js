const privacy = require("../config/privacy");

const isProduction =
  process.env.NODE_ENV === "production";

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "token",
  "password",
  "code",
  "email",
  "to",
  "from",
  "text",
  "html",
  "body",
  "message",
  "attachment",
  "file",
  "url",
  "ip",
  "userAgent",
  "user-agent"
]);

function redact(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => redact(item, depth + 1));
  }

  if (typeof value === "object") {
    const result = {};

    for (const [key, child] of Object.entries(value)) {
      if (REDACTED_KEYS.has(String(key).toLowerCase())) {
        result[key] = "[redacted]";
        continue;
      }

      result[key] = redact(child, depth + 1);
    }

    return result;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }

  return value;
}

function serializeError(err) {
  if (!err) {
    return undefined;
  }

  return {
    name: err.name,
    code: err.code,
    status: err.status,
    ...(privacy.minimalLogs ? {} : { message: err.message })
  };
}

function log(level, message, meta) {
  if (
    isProduction &&
    level === "debug"
  ) {
    return;
  }

  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta: redact(meta) } : {})
  };

  const line =
    JSON.stringify(payload);

  if (
    level === "error" ||
    level === "warn"
  ) {
    console.error(line);
    return;
  }

  console.log(line);
}

module.exports = {
  info(message, meta) {
    log("info", message, meta);
  },

  warn(message, meta) {
    log("warn", message, meta);
  },

  error(message, err, meta) {
    log("error", message, {
      ...(meta || {}),
      error: serializeError(err)
    });
  },

  debug(message, meta) {
    log("debug", message, meta);
  }
};
