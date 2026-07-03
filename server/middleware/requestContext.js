const crypto = require("crypto");
const logger = require("../utils/logger");
const privacy = require("../config/privacy");
const { hashRequestIp } = require("../utils/securityIds");

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 1500;

function createRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function getSafePath(req) {
  const original = String(req.originalUrl || req.url || "");

  if (privacy.logQueryString) {
    return original.slice(0, 300);
  }

  return original.split("?")[0].slice(0, 300);
}

function requestContext(req, res, next) {
  const requestId = req.headers["x-request-id"] || createRequestId();
  const startedAt = Date.now();

  req.id = String(requestId).slice(0, 80);
  req.safePath = getSafePath(req);
  res.setHeader("X-Request-Id", req.id);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode;

    const meta = {
      requestId: req.id,
      method: req.method,
      path: req.safePath,
      statusCode,
      durationMs,
      ...(privacy.logIpHash ? { ipHash: hashRequestIp(req) } : {}),
      ...(privacy.logUserHandle && req.user?.username ? { user: req.user.username } : {})
    };

    if (statusCode >= 500) {
      logger.warn("http request completed", meta);
      return;
    }

    if (durationMs >= SLOW_REQUEST_MS) {
      logger.info("slow http request completed", meta);
    }
  });

  next();
}

module.exports = requestContext;
