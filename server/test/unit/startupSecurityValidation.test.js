const assert = require("node:assert/strict");
const test = require("node:test");

const { validateStartupSecurity } = require("../../security/startupSecurityValidation");

const PROCESS_ENV_KEYS = [
  "AUTH_COOKIE_DOMAIN",
  "COOKIE_DOMAIN",
  "LIOTAN_CRYPTO_DOMAIN",
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
        PUBLIC_SECURITY_URL: "https://security.liotan.com/unexpected-path"
      }, { warn() {} }),
      error => error.code === "STARTUP_SECURITY_VALIDATION_FAILED" &&
        error.findings.some(finding => finding.code === "public_security_url_required")
    );
  } finally {
    restoreProcessEnv(snapshot);
  }
});
