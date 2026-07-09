const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..", "..");

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

function addFinding(findings, severity, file, message) {
  findings.push({ severity, file, message });
}

function main() {
  const findings = [];

  const envJs = read("server/config/env.js");
  const serverJs = read("server/server.js");
  const guardJs = read("server/security/vpsRuntimeGuard.js");

  if (!envJs.includes("HOST:")) {
    addFinding(findings, "critical", "server/config/env.js", "HOST is not defined in env config.");
  }

  if (!envJs.includes("127.0.0.1")) {
    addFinding(findings, "critical", "server/config/env.js", "Production localhost bind fallback is missing.");
  }

  if (!envJs.includes("LIOTAN_ALLOW_PUBLIC_BIND")) {
    addFinding(findings, "medium", "server/config/env.js", "Explicit public bind override flag is missing.");
  }

  if (!serverJs.includes("server.listen(env.PORT, env.HOST")) {
    addFinding(findings, "critical", "server/server.js", "Server does not bind to env.HOST explicitly.");
  }

  if (!serverJs.includes("assertVpsBindingSafe(env, logger)")) {
    addFinding(findings, "critical", "server/server.js", "Runtime VPS bind guard is not called on startup.");
  }

  if (!guardJs.includes("Unsafe production bind refused")) {
    addFinding(findings, "critical", "server/security/vpsRuntimeGuard.js", "Runtime guard does not refuse unsafe production binds.");
  }

  const ok = findings.length === 0;
  const result = { ok, findings };
  console.log(JSON.stringify(result, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main();
