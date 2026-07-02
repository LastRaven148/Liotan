require("dotenv").config();

const http = require("http");
const httpProxy = require("http-proxy");

const PORT = Number(process.env.PORT || 3002);
const UPSTREAM_URL = normalizeUrl(process.env.RELAY_UPSTREAM_URL || process.env.UPSTREAM_URL || "http://localhost:3001");
const RELAY_NAME = String(process.env.RELAY_NAME || "liotan-relay").trim() || "liotan-relay";
const REQUEST_TIMEOUT_MS = Number(process.env.RELAY_REQUEST_TIMEOUT_MS || 15000);
const PROXY_TIMEOUT_MS = Number(process.env.RELAY_PROXY_TIMEOUT_MS || 15000);
const allowedOrigins = splitList(process.env.RELAY_ALLOWED_ORIGINS || "http://localhost:5173,https://liotan.com,https://www.liotan.com");

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-liotan-relay": RELAY_NAME
  });
  res.end(body);
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || "").replace(/\/+$/, "");
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  }

  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type,X-Liotan-Device-Id,X-Liotan-Device-Name,X-Liotan-CSRF,X-Requested-With");
  res.setHeader("access-control-max-age", "600");
}

function isRelayHealthPath(url = "") {
  const path = String(url).split("?")[0];
  return path === "/relay/health" || path === "/relay/status";
}

function isPreflight(req) {
  return req.method === "OPTIONS" && Boolean(req.headers.origin) && Boolean(req.headers["access-control-request-method"]);
}

function addForwardingHeaders(proxyReq, req) {
  proxyReq.setHeader("x-liotan-relay", RELAY_NAME);
  proxyReq.setHeader("x-forwarded-host", req.headers.host || "");
  proxyReq.setHeader("x-forwarded-proto", "https");
}

const proxy = httpProxy.createProxyServer({
  target: UPSTREAM_URL,
  changeOrigin: true,
  ws: true,
  xfwd: true,
  secure: true,
  timeout: REQUEST_TIMEOUT_MS,
  proxyTimeout: PROXY_TIMEOUT_MS
});

proxy.on("proxyReq", addForwardingHeaders);
proxy.on("proxyReqWs", addForwardingHeaders);

proxy.on("proxyRes", (proxyRes) => {
  proxyRes.headers["x-liotan-relay"] = RELAY_NAME;
  proxyRes.headers["cache-control"] = proxyRes.headers["cache-control"] || "no-store";
});

proxy.on("error", (err, req, res) => {
  const payload = {
    error: "Relay upstream unavailable",
    relay: RELAY_NAME,
    upstream: UPSTREAM_URL
  };

  if (res && !res.headersSent) {
    applyCors(req, res);
    sendJson(res, 502, payload);
    return;
  }

  try {
    res.end();
  } catch {}

});

const server = http.createServer((req, res) => {
  applyCors(req, res);

  if (isRelayHealthPath(req.url)) {
    sendJson(res, 200, {
      ok: true,
      service: "liotan-relay",
      relay: RELAY_NAME,
      upstream: UPSTREAM_URL,
      time: new Date().toISOString()
    });
    return;
  }

  if (isPreflight(req)) {
    res.writeHead(204);
    res.end();
    return;
  }

  proxy.web(req, res, {
    target: UPSTREAM_URL
  });
});

server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, {
    target: UPSTREAM_URL
  });
});

server.listen(PORT);
