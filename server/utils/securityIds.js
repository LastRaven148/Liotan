const crypto =
  require("crypto");

function getSecret() {
  return (
    process.env.PRIVACY_HASH_SECRET ||
    process.env.JWT_SECRET ||
    "liotan-local-dev"
  );
}

function hmac(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(value || "unknown"))
    .digest("hex");
}

function getRequestIp(req) {
  const forwarded =
    req.headers?.["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded)
      .split(",")[0]
      .trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getSocketIp(socket) {
  const forwarded =
    socket.handshake?.headers?.["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded)
      .split(",")[0]
      .trim();
  }

  return (
    socket.handshake?.address ||
    socket.conn?.remoteAddress ||
    socket.request?.socket?.remoteAddress ||
    "unknown"
  );
}

function hashRequestIp(req) {
  return hmac(getRequestIp(req));
}

function hashSocketIp(socket) {
  return hmac(getSocketIp(socket));
}

module.exports = {
  hmac,
  getRequestIp,
  getSocketIp,
  hashRequestIp,
  hashSocketIp
};
