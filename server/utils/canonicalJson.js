"use strict";

function normalize(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number is not canonical JSON");
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map(item => {
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        throw new TypeError("unsupported array value in canonical JSON");
      }
      return normalize(item, seen);
    });
  }

  if (typeof value !== "object" || value === undefined) {
    throw new TypeError("unsupported value in canonical JSON");
  }

  if (seen.has(value)) throw new TypeError("cyclic value is not canonical JSON");
  seen.add(value);

  const output = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined || typeof item === "function" || typeof item === "symbol") {
      throw new TypeError("unsupported object value in canonical JSON");
    }
    output[key] = normalize(item, seen);
  }

  seen.delete(value);
  return output;
}

function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

module.exports = { canonicalJson, normalizeCanonicalValue: normalize };
