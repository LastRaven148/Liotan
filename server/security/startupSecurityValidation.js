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

    const requiredR2 = [
      "R2_MEDIA_ACCOUNT_ID", "R2_MEDIA_ACCESS_KEY_ID", "R2_MEDIA_SECRET_ACCESS_KEY", "R2_MEDIA_BUCKET",
      "R2_AVATAR_ACCOUNT_ID", "R2_AVATAR_ACCESS_KEY_ID", "R2_AVATAR_SECRET_ACCESS_KEY", "R2_AVATAR_BUCKET", "R2_AVATAR_PUBLIC_URL"
    ];
    const missingR2 = requiredR2.filter(name => !String(process.env[name] || "").trim());
    if (missingR2.length) {
      findings.push({
        severity: "critical",
        code: "separate_r2_configuration_required",
        message: `Private media and public avatar R2 configuration is incomplete: ${missingR2.join(", ")}`
      });
    }
    if (process.env.R2_MEDIA_BUCKET && process.env.R2_MEDIA_BUCKET === process.env.R2_AVATAR_BUCKET) {
      findings.push({
        severity: "critical",
        code: "shared_r2_bucket_for_private_and_public_data",
        message: "R2_MEDIA_BUCKET and R2_AVATAR_BUCKET must be different buckets."
      });
    }
    if (
      process.env.R2_MEDIA_ACCESS_KEY_ID &&
      process.env.R2_MEDIA_ACCESS_KEY_ID === process.env.R2_AVATAR_ACCESS_KEY_ID
    ) {
      findings.push({
        severity: "critical",
        code: "shared_r2_credentials_for_private_and_public_data",
        message: "Private media and public avatars require different bucket-scoped R2 credentials."
      });
    }
    if (process.env.R2_PUBLIC_URL || process.env.R2_BUCKET) {
      findings.push({
        severity: "critical",
        code: "legacy_shared_r2_configuration_present",
        message: "Remove legacy R2_BUCKET/R2_PUBLIC_URL variables after migrating to separate media/avatar buckets."
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
