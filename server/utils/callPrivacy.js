const crypto = require("crypto");

function getCallSecret() {
  return (
    process.env.CALL_ROUTE_SECRET ||
    process.env.JWT_SECRET ||
    "liotan-dev-call-route-secret"
  );
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

function getCallRouteId(username) {
  const value = normalizeUsername(username);

  if (!value) {
    return null;
  }

  return crypto
    .createHmac("sha256", getCallSecret())
    .update(`liotan-call-route:v1:${value}`)
    .digest("base64url")
    .slice(0, 48);
}

function getCallRoom(username) {
  const routeId = getCallRouteId(username);

  return routeId
    ? `call:${routeId}`
    : null;
}

function isValidCallRouteId(routeId) {
  return (
    typeof routeId === "string" &&
    /^[A-Za-z0-9_-]{32,80}$/.test(routeId)
  );
}

function sanitizeCallId(callId) {
  if (
    typeof callId !== "string" ||
    !/^[A-Za-z0-9_-]{12,128}$/.test(callId)
  ) {
    return null;
  }

  return callId;
}

function sanitizeSignalPayload(value, maxLength = 65536) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  let text = "";

  try {
    text = JSON.stringify(value);
  } catch (err) {
    return null;
  }

  if (text.length > maxLength) {
    return null;
  }

  return JSON.parse(text);
}

module.exports = {
  getCallRouteId,
  getCallRoom,
  isValidCallRouteId,
  sanitizeCallId,
  sanitizeSignalPayload
};
