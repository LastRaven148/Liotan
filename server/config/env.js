const path = require("path");
const { expressTrustProxy, proxyConfigFromEnv } = require("./proxyTrust");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing`);
  }

  return process.env[name];
}

const proxy = proxyConfigFromEnv(process.env);

const env = {
  PORT: process.env.PORT || 3001,
  HOST: process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: requireEnv("JWT_SECRET"),
  MONGO_URI: requireEnv("MONGO_URI"),
  CLIENT_URL: process.env.CLIENT_URL || "",
  PUBLIC_SECURITY_URL: process.env.PUBLIC_SECURITY_URL || "",
  LIOTAN_KEEP_LEGACY_ACCOUNTS: process.env.LIOTAN_KEEP_LEGACY_ACCOUNTS || "false",
  LIOTAN_ALLOW_PUBLIC_BIND: process.env.LIOTAN_ALLOW_PUBLIC_BIND || "false",
  LIOTAN_ENFORCE_PROXY_PROTO: process.env.LIOTAN_ENFORCE_PROXY_PROTO || "true",
  LIOTAN_PROXY_TOPOLOGY: proxy.topology,
  TRUSTED_PROXY_CIDRS: process.env.TRUSTED_PROXY_CIDRS || "",
  TRUST_PROXY_CONFIG: expressTrustProxy(process.env)
};

module.exports = env;
