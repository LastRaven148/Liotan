const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..", "..");

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

function addFinding(findings, severity, file, message) {
  findings.push({ severity, file, message });
}

function mustInclude(findings, file, content, token, severity, message) {
  if (!content.includes(token)) {
    addFinding(findings, severity, file, message);
  }
}

function main() {
  const findings = [];

  const envJs = read("server/config/env.js");
  const serverJs = read("server/server.js");
  const appJs = read("server/app.js");
  const guardJs = read("server/security/vpsRuntimeGuard.js");
  const hostGuardJs = read("server/middleware/productionHostGuard.js");
  const proxyGuardJs = read("server/middleware/proxyProtocolGuard.js");
  const httpHardeningJs = read("server/security/httpServerHardening.js");
  const startupValidationJs = read("server/security/startupSecurityValidation.js");
  const socketGuardJs = read("server/security/socketHandshakeGuard.js");

  mustInclude(findings, "server/config/env.js", envJs, "HOST:", "critical", "HOST is not defined in env config.");
  mustInclude(findings, "server/config/env.js", envJs, "127.0.0.1", "critical", "Production localhost bind fallback is missing.");
  mustInclude(findings, "server/config/env.js", envJs, "LIOTAN_ALLOW_PUBLIC_BIND", "medium", "Explicit public bind override flag is missing.");
  mustInclude(findings, "server/config/env.js", envJs, "TRUST_PROXY_HOPS", "medium", "Trusted proxy hop count is not configured centrally.");
  mustInclude(findings, "server/config/env.js", envJs, "LIOTAN_ENFORCE_PROXY_PROTO", "medium", "Proxy protocol guard toggle is missing.");

  mustInclude(findings, "server/server.js", serverJs, "server.listen(env.PORT, env.HOST", "critical", "Server does not bind to env.HOST explicitly.");
  mustInclude(findings, "server/server.js", serverJs, "assertVpsBindingSafe(env, logger)", "critical", "Runtime VPS bind guard is not called on startup.");
  mustInclude(findings, "server/server.js", serverJs, "validateStartupSecurity(env, logger)", "high", "Startup security validation is not called on startup.");
  mustInclude(findings, "server/server.js", serverJs, "applyHttpServerHardening(server", "high", "HTTP server timeout hardening is not applied.");

  mustInclude(findings, "server/security/vpsRuntimeGuard.js", guardJs, "Unsafe production bind refused", "critical", "Runtime guard does not refuse unsafe production binds.");
  mustInclude(findings, "server/security/httpServerHardening.js", httpHardeningJs, "headersTimeout", "high", "HTTP headers timeout hardening is missing.");
  mustInclude(findings, "server/security/httpServerHardening.js", httpHardeningJs, "requestTimeout", "high", "HTTP request timeout hardening is missing.");
  mustInclude(findings, "server/security/startupSecurityValidation.js", startupValidationJs, "weak_jwt_secret", "high", "Weak secret startup validation is missing.");

  mustInclude(findings, "server/app.js", appJs, "app.set(\"trust proxy\", env.TRUST_PROXY_HOPS)", "high", "Express trust proxy is not configured through env.");
  mustInclude(findings, "server/app.js", appJs, "createProductionHostGuard", "high", "Production Host header guard is not enabled before CORS/routes.");
  mustInclude(findings, "server/app.js", appJs, "createProxyProtocolGuard", "high", "Proxy protocol guard is not enabled before routes.");
  mustInclude(findings, "server/app.js", appJs, "apiNoStore", "low", "No-store middleware for unsafe API responses is missing.");
  mustInclude(findings, "server/app.js", appJs, "allowRequest: createSocketAllowRequest", "high", "Socket.IO production handshake guard is not enabled.");

  if (!hostGuardJs.includes("api.liotan.com") || !hostGuardJs.includes("421")) {
    addFinding(findings, "high", "server/middleware/productionHostGuard.js", "Production Host header guard is missing allowed API hosts or rejection status.");
  }

  mustInclude(findings, "server/middleware/proxyProtocolGuard.js", proxyGuardJs, "x-forwarded-proto", "high", "Proxy protocol guard does not validate X-Forwarded-Proto.");
  mustInclude(findings, "server/security/socketHandshakeGuard.js", socketGuardJs, "isOriginAllowed", "high", "Socket handshake guard does not validate origins.");
  mustInclude(findings, "server/security/socketHandshakeGuard.js", socketGuardJs, "host not allowed", "high", "Socket handshake guard does not validate Host.");

  const ok = findings.length === 0;
  const result = { ok, findings };
  console.log(JSON.stringify(result, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main();
