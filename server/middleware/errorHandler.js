const logger = require("../utils/logger");

function getSafeMessage(err) {
  if (err?.status && err.status < 500 && err.message) {
    return err.message;
  }

  return "server error";
}

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  logger.error("request failed", err, {
    requestId: req.id,
    method: req.method,
    path: req.safePath || String(req.path || "").slice(0, 300),
    status,
    ...(require("../config/privacy").logUserHandle && req.user?.username ? { user: req.user.username } : {})
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(status).json({
    error: getSafeMessage({ ...err, status }),
    requestId: req.id
  });
}

module.exports = errorHandler;
