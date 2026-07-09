const { normalizeHost } = require("./productionHostGuard");

function createProxyProtocolGuard(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || "development";
  const enforce = options.enforce ?? process.env.LIOTAN_ENFORCE_PROXY_PROTO !== "false";

  return function proxyProtocolGuard(req, res, next) {
    if (nodeEnv !== "production" || !enforce) {
      next();
      return;
    }

    const host = normalizeHost(req.headers.host);
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      next();
      return;
    }

    const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    if (proto === "https") {
      next();
      return;
    }

    res.status(400).json({ ok: false, error: "Invalid proxy protocol" });
  };
}

module.exports = {
  createProxyProtocolGuard
};
