const PRODUCTION_ALLOWED_ORIGINS = [
  "https://liotan.ru",
  "https://www.liotan.ru",

  "https://liotan.com",
  "https://www.liotan.com",

  "https://tunnel.liotan.com"
];

const DEVELOPMENT_ALLOWED_ORIGINS = [
  ...PRODUCTION_ALLOWED_ORIGINS,

  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
];

function normalizeOrigin(origin) {
  if (typeof origin !== "string") return "";
  return origin.trim().replace(/\/+$/, "");
}

function parseAllowedOrigins(value) {
  if (!value) return [];

  return value
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

const defaultAllowedOrigins = isProduction()
  ? PRODUCTION_ALLOWED_ORIGINS
  : DEVELOPMENT_ALLOWED_ORIGINS;

const envAllowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const legacyAllowedOrigins = parseAllowedOrigins(process.env.LEGACY_ALLOWED_ORIGINS);

const allowedOrigins = new Set(
  [
    ...defaultAllowedOrigins,
    ...envAllowedOrigins,
    ...legacyAllowedOrigins,
  ].map(normalizeOrigin)
);

function isOriginAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.has(normalizeOrigin(origin));
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    callback(new Error(`Origin "${origin}" is not allowed by CORS`));
  },

  credentials: true,

  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Accept",
    "Authorization",
    "Content-Type",
    "Origin",
    "X-Requested-With",
    "X-Request-Id",
    "X-Liotan-CSRF",
  ],

  exposedHeaders: ["X-Request-Id"],

  optionsSuccessStatus: 204,
};

module.exports = {
  corsOptions,
  allowedOrigins,
  isOriginAllowed,
};
