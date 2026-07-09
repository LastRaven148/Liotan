const { isOriginAllowed } = require("../config/corsOptions");
const { DEFAULT_ALLOWED_API_HOSTS, normalizeHost, parseAllowedApiHosts } = require("../middleware/productionHostGuard");

function createSocketAllowRequest(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || "development";
  const allowedHosts = new Set([
    ...DEFAULT_ALLOWED_API_HOSTS,
    ...parseAllowedApiHosts(options.allowedApiHosts || process.env.API_ALLOWED_HOSTS)
  ]);

  return function allowRequest(req, callback) {
    if (nodeEnv !== "production") {
      callback(null, true);
      return;
    }

    const origin = req.headers.origin;
    if (origin && !isOriginAllowed(origin)) {
      callback("origin not allowed", false);
      return;
    }

    const host = normalizeHost(req.headers.host);
    if (host && !allowedHosts.has(host)) {
      callback("host not allowed", false);
      return;
    }

    callback(null, true);
  };
}

module.exports = {
  createSocketAllowRequest
};
