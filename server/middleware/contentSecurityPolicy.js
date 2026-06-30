function buildConnectSources() {
  return [
    "'self'",
    "https://liotan.onrender.com",
    "https://liotan-api.onrender.com",
    process.env.CLIENT_URL,
    process.env.API_URL,
    "https://api.cloudinary.com",
    "https://res.cloudinary.com",
    "wss://liotan.onrender.com",
    "wss://liotan-api.onrender.com"
  ].filter(Boolean);
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
