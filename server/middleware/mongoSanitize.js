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

function assignCleanValue(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (!isSanitizableObject(value)) {
    return value;
  }

  const clean = Object.create(null);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (isBlockedKey(key)) {
      continue;
    }

    assignCleanValue(clean, key, sanitizeValue(nestedValue));
  }

  return clean;
}

function mongoSanitize(req, res, next) {
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  next();
}

module.exports = mongoSanitize;
module.exports.sanitizeValue = sanitizeValue;
module.exports.isBlockedKey = isBlockedKey;
