const crypto = require("crypto");
const { proxyConfigFromEnv } = require("../config/proxyTrust");
const { validateIndependentSecrets } = require("./secretIsolation");

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
  const runtimeEnv = { ...process.env, ...env };

  if (env.NODE_ENV === "production") {
    let publicSecurityUrl;
    try {
      publicSecurityUrl = new URL(String(env.PUBLIC_SECURITY_URL || ""));
    } catch {
      publicSecurityUrl = null;
    }
    if (
      !publicSecurityUrl ||
      publicSecurityUrl.protocol !== "https:" ||
      publicSecurityUrl.username ||
      publicSecurityUrl.password ||
      publicSecurityUrl.pathname !== "/" ||
      publicSecurityUrl.search ||
      publicSecurityUrl.hash
    ) {
      findings.push({
        severity: "critical",
        code: "public_security_url_required",
        message: "PUBLIC_SECURITY_URL must be an HTTPS origin used exclusively for security email actions."
      });
    }

    if (process.env.AUTH_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN) {
      findings.push({
        severity: "critical",
        code: "domain_cookie_forbidden",
        message: "Use a host-only __Host- auth cookie; remove AUTH_COOKIE_DOMAIN and COOKIE_DOMAIN."
      });
    }
    if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(String(process.env.LIOTAN_CRYPTO_DOMAIN || ""))) {
      findings.push({
        severity: "critical",
        code: "mls_crypto_domain_required",
        message: "LIOTAN_CRYPTO_DOMAIN must be a stable production domain used in MLS ClientIds."
      });
    }
    findings.push(...validateIndependentSecrets(runtimeEnv, looksLikeWeakSecret));
    try {
      const proxy = proxyConfigFromEnv(runtimeEnv);
      if (!runtimeEnv.LIOTAN_PROXY_TOPOLOGY) {
        throw new TypeError("explicit production topology required");
      }
      if (proxy.topology !== "direct" && proxy.trustedCidrs.length === 0) {
        throw new TypeError("trusted proxy CIDRs required");
      }
    } catch {
      findings.push({
        severity: "critical",
        code: "invalid_proxy_trust_topology",
        message: "LIOTAN_PROXY_TOPOLOGY and TRUSTED_PROXY_CIDRS must describe the exact production edge path."
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
