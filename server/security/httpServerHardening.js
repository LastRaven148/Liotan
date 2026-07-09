function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function applyHttpServerHardening(server, env = process.env) {
  const requestTimeoutMs = toPositiveInt(env.HTTP_REQUEST_TIMEOUT_MS, 120000);
  const headersTimeoutMs = toPositiveInt(env.HTTP_HEADERS_TIMEOUT_MS, 65000);
  const keepAliveTimeoutMs = toPositiveInt(env.HTTP_KEEP_ALIVE_TIMEOUT_MS, 5000);
  const maxRequestsPerSocket = toPositiveInt(env.HTTP_MAX_REQUESTS_PER_SOCKET, 1000);

  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(headersTimeoutMs, requestTimeoutMs + 1000);
  server.keepAliveTimeout = keepAliveTimeoutMs;
  server.maxRequestsPerSocket = maxRequestsPerSocket;

  return {
    requestTimeoutMs: server.requestTimeout,
    headersTimeoutMs: server.headersTimeout,
    keepAliveTimeoutMs: server.keepAliveTimeout,
    maxRequestsPerSocket: server.maxRequestsPerSocket
  };
}

module.exports = {
  applyHttpServerHardening,
  toPositiveInt
};
