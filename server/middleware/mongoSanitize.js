const BLOCKED_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype"
]);

function isBlockedKey(key) {
  return (
    typeof key !== "string" ||
    key.startsWith("$") ||
    key.includes(".") ||
    BLOCKED_KEYS.has(key)
  );
}

function isSanitizableObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Buffer.isBuffer(value)) {
    return false;
  }

  if (value instanceof Date || value instanceof RegExp || value instanceof ArrayBuffer) {
    return false;
  }

  if (ArrayBuffer.isView(value)) {
    return false;
  }

  return true;
}

function sanitizeValue(value) {
  const pending = [value];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!isSanitizableObject(current)) continue;
    visited += 1;
    if (visited > 10_000) {
      const error = new Error("request structure is too complex");
      error.status = 400;
      throw error;
    }
    for (const [key, nestedValue] of Object.entries(current)) {
      if (isBlockedKey(key)) {
        const error = new Error("invalid request fields");
        error.status = 400;
        throw error;
      }
      pending.push(nestedValue);
    }
  }
  return value;
}

function mongoSanitize(req, res, next) {
  try {
    sanitizeValue(req.body);
    sanitizeValue(req.params);
    sanitizeValue(req.query);
    next();
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
}

module.exports = mongoSanitize;
module.exports.sanitizeValue = sanitizeValue;
module.exports.isBlockedKey = isBlockedKey;
