const DEFAULT_ALLOWED_API_HOSTS = new Set([
  "api.liotan.com",
  "api.liotan.ru",
  "api-tunnel.liotan.com",
  "localhost",
  "127.0.0.1",
  "::1"
]);

function normalizeHost(host) {
  if (typeof host !== "string") return "";

  const value = host.trim().toLowerCase();
  if (!value) return "";

  if (value.startsWith("[::1]")) return "::1";

  return value.split(":")[0];
}

function parseAllowedApiHosts(value) {
  if (!value) return [];

  return value
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);
}

function createProductionHostGuard(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || "development";
  const allowedHosts = new Set([
    ...DEFAULT_ALLOWED_API_HOSTS,
    ...parseAllowedApiHosts(options.allowedApiHosts || process.env.API_ALLOWED_HOSTS)
  ]);

  return function productionHostGuard(req, res, next) {
    if (nodeEnv !== "production") {
      next();
      return;
    }

    const host = normalizeHost(req.headers.host);

    if (!host || allowedHosts.has(host)) {
      next();
      return;
    }

    res.status(421).json({ ok: false, error: "Misdirected request" });
  };
}

module.exports = {
  DEFAULT_ALLOWED_API_HOSTS,
  createProductionHostGuard,
  normalizeHost,
  parseAllowedApiHosts
};
