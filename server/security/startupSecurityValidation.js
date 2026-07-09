const crypto = require("crypto");

const DEFAULT_SECRET_PATTERNS = [
  "secret",
  "changeme",
  "change_me",
  "default",
  "password",
  "jwt_secret",
  "dev-secret",
  "test-secret"
];

function looksLikeWeakSecret(value) {
  if (typeof value !== "string") return true;

  const normalized = value.trim().toLowerCase();
  if (normalized.length < 32) return true;

  return DEFAULT_SECRET_PATTERNS.some(pattern => normalized.includes(pattern));
}

function validateStartupSecurity(env, logger = console) {
  const findings = [];

  if (env.NODE_ENV === "production") {
    if (looksLikeWeakSecret(env.JWT_SECRET)) {
      findings.push({
        severity: "critical",
        code: "weak_jwt_secret",
        message: "JWT_SECRET must be a strong production secret of at least 32 characters."
      });
    }

    if (env.LIOTAN_ALLOW_PUBLIC_BIND === "true") {
      findings.push({
        severity: "high",
        code: "public_bind_override_enabled",
        message: "LIOTAN_ALLOW_PUBLIC_BIND is enabled in production."
      });
    }
  }

  for (const finding of findings) {
    logger.warn?.("startup security finding", finding);
  }

  if (findings.some(finding => finding.severity === "critical")) {
    const err = new Error("Critical startup security validation failed");
    err.code = "STARTUP_SECURITY_VALIDATION_FAILED";
    err.findings = findings;
    throw err;
  }

  return findings;
}

function createSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

module.exports = {
  DEFAULT_SECRET_PATTERNS,
  createSecret,
  looksLikeWeakSecret,
  validateStartupSecurity
};
