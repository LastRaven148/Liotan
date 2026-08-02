"use strict";

const APP_SECRET_NAMES = [
  "JWT_SECRET",
  "PRIVACY_HASH_SECRET",
  "SECURITY_ENCRYPTION_SECRET",
  "CALL_ROUTE_SECRET",
  "KEY_TRANSPARENCY_SIGNING_KEY"
];

function getRuntimeSecret(name, developmentLabel, source = process.env) {
  const value = String(source[name] || "");
  if (value) return value;
  if (source.NODE_ENV === "production") {
    throw new Error(`${name} is required in production`);
  }
  return `liotan-development-only-isolated-secret:${developmentLabel}:v1`;
}

function validateIndependentSecrets(source, looksWeak) {
  const findings = [];
  const values = new Map();
  for (const name of APP_SECRET_NAMES) {
    const value = String(source[name] || "");
    if (looksWeak(value)) {
      findings.push({
        severity: "critical",
        code: `weak_${name.toLowerCase()}`,
        message: `${name} must be an independent strong production secret of at least 32 characters.`
      });
      continue;
    }
    const prior = values.get(value);
    if (prior) {
      findings.push({
        severity: "critical",
        code: "shared_application_secret",
        message: `${prior} and ${name} must not share the same value.`
      });
    } else {
      values.set(value, name);
    }
  }
  return findings;
}

module.exports = {
  APP_SECRET_NAMES,
  getRuntimeSecret,
  validateIndependentSecrets
};
