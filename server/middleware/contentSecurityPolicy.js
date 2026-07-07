const CONNECT_SOURCES = [
  "'self'",

  "https://liotan.ru",
  "https://www.liotan.ru",
  "https://api.liotan.ru",
  "https://media.liotan.ru",

  "https://liotan.com",
  "https://www.liotan.com",
  "https://api.liotan.com",
  "https://media.liotan.com",

  "https://tunnel.liotan.com",
  "https://api-tunnel.liotan.com",

  "wss://liotan.ru",
  "wss://www.liotan.ru",
  "wss://api.liotan.ru",

  "wss://liotan.com",
  "wss://www.liotan.com",
  "wss://api.liotan.com",

  "wss://tunnel.liotan.com",
  "wss://api-tunnel.liotan.com",

  "http://localhost:*",
  "http://127.0.0.1:*",
  "ws://localhost:*",
  "ws://127.0.0.1:*",
];

const MEDIA_SOURCES = [
  "'self'",
  "blob:",
  "https://media.liotan.ru",
  "https://media.liotan.com",
  "https://api-tunnel.liotan.com",
];

const IMAGE_SOURCES = [
  "'self'",
  "data:",
  "blob:",
  "https://media.liotan.ru",
  "https://media.liotan.com",
  "https://api-tunnel.liotan.com",
];

const contentSecurityPolicyDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],

  imgSrc: IMAGE_SOURCES,
  mediaSrc: MEDIA_SOURCES,
  connectSrc: CONNECT_SOURCES,

  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'", "data:"],
  workerSrc: ["'self'", "blob:"],
  formAction: ["'self'"],

  upgradeInsecureRequests: [],
};

module.exports = {
  useDefaults: false,
  directives: contentSecurityPolicyDirectives,
};
