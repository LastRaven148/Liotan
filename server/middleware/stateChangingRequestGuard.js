const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUIRED_HEADER = "x-liotan-csrf";

function hasValidStateHeader(req) {
  const value = req.headers[REQUIRED_HEADER];
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function isTokenProtectedBrowserAction(req) {
  const path = req.path || "";
  return /^\/auth\/register\/cancel\/[^/]+\/action\/[^/]+$/.test(path) ||
    /^\/auth\/email-change\/cancel\/[A-Za-z0-9_-]{32,256}$/.test(path);
}

function stateChangingRequestGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (isTokenProtectedBrowserAction(req)) {
    return next();
  }

  if (!hasValidStateHeader(req)) {
    return res.status(403).json({
      error: "request rejected"
    });
  }

  return next();
}

module.exports = {
  REQUIRED_HEADER,
  stateChangingRequestGuard
};
