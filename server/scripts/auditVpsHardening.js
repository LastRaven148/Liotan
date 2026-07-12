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
  const deployScript = read("server/deploy/install-release.sh");
  const cleanupScript = read("server/deploy/cleanup-known-curl-artifacts.sh");
  const deployWorkflow = read(".github/workflows/deploy-vps.yml");
  const nginxTemplate = read("server/deploy/nginx-liotan-api.conf");

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

  for (const [token, message] of [
    ["flock -n", "Deployment lock is missing."],
    ["client/build/index.html", "Frontend index preflight is missing."],
    ["test-only production fixture is present", "Deployment bundle does not reject browser-test fixtures."],
    ["test-only productionCrypto chunk is present", "Deployment bundle does not reject browser-test chunks."],
    ["*.wasm", "CoreCrypto WASM preflight is missing."],
    ["validate_frontend", "Frontend smoke test is missing."],
    ["cmp -s", "Active revision index comparison is missing."],
    ["application/wasm", "WASM MIME smoke test is missing."],
    ["rollback", "Atomic rollback is missing."],
    ["shared/server.env", "Shared environment preservation is missing."],
    ["wait_for_health", "Explicit backend health wait loop is missing."],
    ["while (( SECONDS < deadline ))", "Backend health wait must have an explicit deadline."],
    ["--max-time 5", "Each backend health request must have a bounded timeout."],
    ["pm2 pid \"$process_name\"", "Backend health wait must detect an exited PM2 process."],
    ["expected_public_target=\"$current/client/build\"", "Frontend link preflight must require the atomic current path."],
    ["backend was not restarted", "Invalid frontend wiring must fail before backend restart."],
    ["fail_invariant", "Deployment invariant failures must identify the failing stage."],
    ["shared/uploads", "Shared uploads preservation is missing."],
    ["legacy_checkout=/home/liotan/apps/Liotan", "Legacy checkout rejection is missing."],
    ["current target is outside", "Current target containment validation is missing."],
    ["current target basename is not a Git SHA", "Current release SHA validation is missing."],
    ["validate_pm2_runtime", "PM2 path, cwd, status, and version validation is missing."],
    ["running version", "Running PM2 version is not compared with package.json."],
    ["preflight health check failed; current was not changed", "Preflight health validation is missing."],
    ["rollback PM2", "Rollback PM2 validation is missing."],
    ["verified rollback both failed", "Critical rollback failure diagnostic is missing."],
    ["shared runtime data and secrets", "Release rotation does not document shared-data isolation."]
  ]) {
    mustInclude(findings, "server/deploy/install-release.sh", deployScript, token, "high", message);
  }

  if (/(?:^|\s)>\s*--retry(?:-delay|-connrefused)?\b/m.test(deployScript)) {
    addFinding(findings, "critical", "server/deploy/install-release.sh", "curl retry option is used as an output redirection target.");
  }
  if (/\/home\/liotan\/apps\/Liotan(?:\/|["'])/.test(deployWorkflow)) {
    addFinding(findings, "critical", ".github/workflows/deploy-vps.yml", "Production workflow references the legacy checkout.");
  }

  for (const artifact of ["--retry", "--retry-connrefused", "--retry-delay"]) {
    mustInclude(findings, "server/deploy/cleanup-known-curl-artifacts.sh", cleanupScript, artifact, "high", `Bounded cleanup does not name ${artifact}.`);
  }
  mustInclude(findings, "server/deploy/cleanup-known-curl-artifacts.sh", cleanupScript, "refusing to remove unexpected", "high", "Bounded cleanup does not refuse unexpected artifact types or contents.");
  if (cleanupScript.includes("git clean")) {
    addFinding(findings, "critical", "server/deploy/cleanup-known-curl-artifacts.sh", "Bounded cleanup must not use git clean.");
  }

  for (const [token, message] of [
    ["no-cache, must-revalidate", "HTML revalidation policy is missing."],
    ["max-age=31536000, immutable", "Immutable hashed-asset policy is missing."],
    ["try_files $uri =404", "Real asset 404 policy is missing."],
    ["application/wasm", "Nginx WASM MIME policy is missing."]
  ]) {
    mustInclude(findings, "server/deploy/nginx-liotan-api.conf", nginxTemplate, token, "high", message);
  }

  const ok = findings.length === 0;
  const result = { ok, findings };
  console.log(JSON.stringify(result, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main();
