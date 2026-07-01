const env = require("./env");

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

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://liotan.com",
  "https://www.liotan.com"
];

const allowedOrigins = Array.from(new Set([
  ...defaultAllowedOrigins,
  normalizeOrigin(env.CLIENT_URL),
  normalizeOrigin(process.env.PUBLIC_CLIENT_URL),
  ...splitOrigins(process.env.ALLOWED_ORIGINS),
  ...splitOrigins(process.env.LEGACY_ALLOWED_ORIGINS)
].filter(Boolean)));

function corsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }

  const cleanOrigin = normalizeOrigin(origin);

  if (allowedOrigins.includes(cleanOrigin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked: ${cleanOrigin}`));
}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],
  allowedHeaders: [
    "Content-Type",
    "X-Liotan-Device-Id",
    "X-Liotan-Device-Name",
    "X-Liotan-CSRF",
    "X-Requested-With"
  ]
};

module.exports = {
  allowedOrigins,
  corsOptions,
  normalizeOrigin,
  splitOrigins
};
