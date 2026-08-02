const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { validateStartupSecurity } = require("../../security/startupSecurityValidation");
const {
  deviceAuthRolloutConfig,
  deviceAuthV1RequestsDisabled,
  legacyEnrollmentAllowed
} = require("../../security/deviceAuthProtocol");

const PROCESS_ENV_KEYS = [
  "AUTH_COOKIE_DOMAIN",
  "COOKIE_DOMAIN",
  "LIOTAN_CRYPTO_DOMAIN",
  "DEVICE_AUTH_V2_ENFORCED_AT",
  "DEVICE_AUTH_V1_REQUESTS_DISABLED_AT",
  "R2_MEDIA_ACCOUNT_ID",
  "R2_MEDIA_ACCESS_KEY_ID",
  "R2_MEDIA_SECRET_ACCESS_KEY",
  "R2_MEDIA_BUCKET",
  "R2_AVATAR_ACCOUNT_ID",
  "R2_AVATAR_ACCESS_KEY_ID",
  "R2_AVATAR_SECRET_ACCESS_KEY",
  "R2_AVATAR_BUCKET",
  "R2_AVATAR_PUBLIC_URL",
  "R2_PUBLIC_URL",
  "R2_BUCKET"
];

function restoreProcessEnv(snapshot) {
  for (const key of PROCESS_ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test("device authentication retirement has no implicit calendar cutoff", () => {
  const snapshot = Object.fromEntries(PROCESS_ENV_KEYS.map(key => [key, process.env[key]]));
  try {
    delete process.env.DEVICE_AUTH_V2_ENFORCED_AT;
    delete process.env.DEVICE_AUTH_V1_REQUESTS_DISABLED_AT;
    assert.deepEqual(deviceAuthRolloutConfig(), {
      legacyEnrollmentCutoff: null,
      v1RequestsDisabledAt: null
    });
    assert.equal(legacyEnrollmentAllowed(), true);
    assert.equal(deviceAuthV1RequestsDisabled(), false);

    process.env.DEVICE_AUTH_V2_ENFORCED_AT = "invalid";
    process.env.DEVICE_AUTH_V1_REQUESTS_DISABLED_AT = "invalid";
    assert.equal(legacyEnrollmentAllowed(), false);
    assert.equal(deviceAuthV1RequestsDisabled(), true);
  } finally {
    restoreProcessEnv(snapshot);
  }
});

test("startup validation reads PUBLIC_SECURITY_URL from the supplied environment", () => {
  const snapshot = Object.fromEntries(PROCESS_ENV_KEYS.map(key => [key, process.env[key]]));

  try {
    delete process.env.AUTH_COOKIE_DOMAIN;
    delete process.env.COOKIE_DOMAIN;
    delete process.env.R2_PUBLIC_URL;
    delete process.env.R2_BUCKET;
    process.env.LIOTAN_CRYPTO_DOMAIN = "liotan.com";
    process.env.R2_MEDIA_ACCOUNT_ID = "media-account";
    process.env.R2_MEDIA_ACCESS_KEY_ID = "media-key";
    process.env.R2_MEDIA_SECRET_ACCESS_KEY = "media-secret";
    process.env.R2_MEDIA_BUCKET = "liotan-private-media";
    process.env.R2_AVATAR_ACCOUNT_ID = "avatar-account";
    process.env.R2_AVATAR_ACCESS_KEY_ID = "avatar-key";
    process.env.R2_AVATAR_SECRET_ACCESS_KEY = "avatar-secret";
    process.env.R2_AVATAR_BUCKET = "liotan-public-avatars";
    process.env.R2_AVATAR_PUBLIC_URL = "https://avatars.liotan.com";

    const baseEnv = {
      NODE_ENV: "production",
      JWT_SECRET: "a".repeat(64),
      PRIVACY_HASH_SECRET: "b".repeat(64),
      SECURITY_ENCRYPTION_SECRET: "c".repeat(64),
      CALL_ROUTE_SECRET: "d".repeat(64),
      KEY_TRANSPARENCY_SIGNING_KEY: crypto.randomBytes(32).toString("base64url"),
      LIOTAN_PROXY_TOPOLOGY: "trusted-nginx",
      TRUSTED_PROXY_CIDRS: "127.0.0.1/32,::1/128",
      DEVICE_AUTH_V2_ENFORCED_AT: "2099-01-01T00:00:00.000Z",
      DEVICE_AUTH_V1_REQUESTS_DISABLED_AT: "2099-02-01T00:00:00.000Z",
      LIOTAN_ALLOW_PUBLIC_BIND: "false"
    };

    assert.doesNotThrow(() => validateStartupSecurity({
      ...baseEnv,
      PUBLIC_SECURITY_URL: "https://security.liotan.com"
    }, { warn() {} }));

    assert.throws(
      () => validateStartupSecurity({
        ...baseEnv,
        PUBLIC_SECURITY_URL: "http://security.liotan.com"
      }, { warn() {} }),
      error => error.code === "STARTUP_SECURITY_VALIDATION_FAILED" &&
        error.findings.some(finding => finding.code === "public_security_url_required")
    );

    assert.throws(
      () => validateStartupSecurity({
        ...baseEnv,
        DEVICE_AUTH_V2_ENFORCED_AT: "",
        DEVICE_AUTH_V1_REQUESTS_DISABLED_AT: "",
        PUBLIC_SECURITY_URL: "https://security.liotan.com"
      }, { warn() {} }),
      error => error.code === "STARTUP_SECURITY_VALIDATION_FAILED" &&
        error.findings.some(finding => finding.code === "device_auth_rollout_configuration_required")
    );

    assert.throws(
      () => validateStartupSecurity({
        ...baseEnv,
        DEVICE_AUTH_V2_ENFORCED_AT: "not-a-date",
        PUBLIC_SECURITY_URL: "https://security.liotan.com"
      }, { warn() {} }),
      error => error.code === "STARTUP_SECURITY_VALIDATION_FAILED" &&
        error.findings.some(finding => finding.code === "device_auth_rollout_configuration_required")
    );

    assert.throws(
      () => validateStartupSecurity({
        ...baseEnv,
        DEVICE_AUTH_V1_REQUESTS_DISABLED_AT: "2098-01-01T00:00:00.000Z",
        PUBLIC_SECURITY_URL: "https://security.liotan.com"
      }, { warn() {} }),
      error => error.code === "STARTUP_SECURITY_VALIDATION_FAILED" &&
        error.findings.some(finding => finding.code === "device_auth_rollout_configuration_required")
    );

    assert.throws(
      () => validateStartupSecurity({
        ...baseEnv,
        PRIVACY_HASH_SECRET: baseEnv.JWT_SECRET,
        PUBLIC_SECURITY_URL: "https://security.liotan.com"
      }, { warn() {} }),
      error => error.code === "STARTUP_SECURITY_VALIDATION_FAILED" &&
        error.findings.some(finding => finding.code === "shared_application_secret")
    );

    assert.throws(
      () => validateStartupSecurity({
        ...baseEnv,
        PUBLIC_SECURITY_URL: "https://security.liotan.com/unexpected-path"
      }, { warn() {} }),
      error => error.code === "STARTUP_SECURITY_VALIDATION_FAILED" &&
        error.findings.some(finding => finding.code === "public_security_url_required")
    );
  } finally {
    restoreProcessEnv(snapshot);
  }
});
