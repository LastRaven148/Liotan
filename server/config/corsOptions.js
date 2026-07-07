const DEFAULT_ALLOWED_ORIGINS = [
  "https://liotan.ru",
  "https://www.liotan.ru",

  // Legacy / fallback domains.
  "https://liotan.com",
  "https://www.liotan.com",

  // Local development.
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

function normalizeOrigin(origin) {
  if (typeof origin !== "string") {
    return "";
  }

  return origin.trim().replace(/\/+$/, "");
}

function parseAllowedOrigins(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

const envAllowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

const allowedOrigins = new Set(
  [...DEFAULT_ALLOWED_ORIGINS, ...envAllowedOrigins].map(normalizeOrigin)
);

export function isOriginAllowed(origin) {
  // Requests without Origin are allowed.
  // Examples: curl, server-to-server requests, health checks.
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(normalizeOrigin(origin));
}

export const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);

    callback(new Error(`Origin "${origin}" is not allowed by CORS`));
  },

  credentials: true,

  methods: [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Accept",
    "Authorization",
    "Content-Type",
    "Origin",
    "X-Requested-With",
    "X-Request-Id",
  ],

  exposedHeaders: [
    "X-Request-Id",
  ],

  optionsSuccessStatus: 204,
};

export { allowedOrigins };

export default corsOptions;