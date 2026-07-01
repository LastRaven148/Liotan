const crypto = require("crypto");
const logger = require("../utils/logger");
const { hashRequestIp } = require("../utils/securityIds");

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 1500;

function createRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function requestContext(req, res, next) {
  const requestId = req.headers["x-request-id"] || createRequestId();
  const startedAt = Date.now();

  req.id = String(requestId).slice(0, 80);
  res.setHeader("X-Request-Id", req.id);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode;

    if (statusCode >= 500 || durationMs >= SLOW_REQUEST_MS) {
      logger.warn("http request completed", {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode,
        durationMs,
        ipHash: hashRequestIp(req),
        user: req.user?.username || null
      });
    }
  });

  next();
}

module.exports = requestContext;
