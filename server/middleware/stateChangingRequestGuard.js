const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUIRED_HEADER = "x-liotan-csrf";

function hasValidStateHeader(req) {
  const value = req.headers[REQUIRED_HEADER];
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function stateChangingRequestGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
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
