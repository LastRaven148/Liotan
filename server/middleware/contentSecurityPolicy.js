function normalizeOrigin(origin) {
  return String(origin || "")
    .trim()
    .replace(/\/+$/, "");
}

function splitOrigins(value) {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function toSecureWebSocketOrigin(origin) {
  const clean = normalizeOrigin(origin);

  if (!clean.startsWith("https://")) {
    return "";
  }

  return `wss://${clean.slice("https://".length)}`;
}

function buildConnectSources() {
  const httpOrigins = Array.from(new Set([
    "https://liotan.com",
    "https://www.liotan.com",
    "https://api.liotan.com",
    process.env.CLIENT_URL,
    process.env.PUBLIC_CLIENT_URL,
    process.env.API_URL,
    process.env.PUBLIC_API_URL,
    ...splitOrigins(process.env.ALLOWED_ORIGINS),
    process.env.R2_PUBLIC_URL
  ].map(normalizeOrigin).filter(Boolean)));

  const wsOrigins = httpOrigins
    .map(toSecureWebSocketOrigin)
    .filter(Boolean);

  return [
    "'self'",
    ...httpOrigins,
    ...wsOrigins
  ];
}

const contentSecurityPolicy = {
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "img-src": ["'self'", "data:", "blob:", process.env.R2_PUBLIC_URL || "https://media.liotan.com"],
    "media-src": ["'self'", "blob:", process.env.R2_PUBLIC_URL || "https://media.liotan.com"],
    "connect-src": buildConnectSources(),
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'", "data:"],
    "worker-src": ["'self'", "blob:"],
    "form-action": ["'self'"],
    "upgrade-insecure-requests": []
  }
};

module.exports = contentSecurityPolicy;
