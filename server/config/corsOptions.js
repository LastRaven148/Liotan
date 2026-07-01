const env = require("./env");

const allowedOrigins = [
  "http://localhost:3000",
  "https://liotan.onrender.com",
  "https://liotan-api.onrender.com",
  env.CLIENT_URL
].filter(Boolean);

function corsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked: ${origin}`));
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
  corsOptions
};
