const crypto =
  require("crypto");
const { socketClientIp } = require("../config/proxyTrust");
const { getRuntimeSecret } = require("../security/secretIsolation");

function getSecret() {
  return getRuntimeSecret("PRIVACY_HASH_SECRET", "security-identifiers");
}

function hmac(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(value || "unknown"))
    .digest("hex");
}

function getRequestIp(req) {
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getSocketIp(socket) {
  return socketClientIp(socket);
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
