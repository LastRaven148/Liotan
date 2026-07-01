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

function toWebSocketOrigin(origin) {
  const clean = normalizeOrigin(origin);

  if (clean.startsWith("https://")) {
    return `wss://${clean.slice("https://".length)}`;
  }

  if (clean.startsWith("http://")) {
    return `ws://${clean.slice("http://".length)}`;
  }

  return "";
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
    "https://api.cloudinary.com",
    "https://res.cloudinary.com"
  ].map(normalizeOrigin).filter(Boolean)));

  const wsOrigins = httpOrigins
    .map(toWebSocketOrigin)
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
    "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
    "media-src": ["'self'", "blob:", "https://res.cloudinary.com"],
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
