const isProduction =
  process.env.NODE_ENV === "production";

function serializeError(err) {
  if (!err) {
    return undefined;
  }

  return {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status
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
    ...(meta ? { meta } : {})
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
