const LOCAL_BIND_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const PUBLIC_BIND_HOSTS = new Set(["0.0.0.0", "::", ""]);

function isProduction(env) {
  return env.NODE_ENV === "production";
}

function isLocalHost(host) {
  return LOCAL_BIND_HOSTS.has(String(host || "").trim().toLowerCase());
}

function isPublicHost(host) {
  return PUBLIC_BIND_HOSTS.has(String(host || "").trim().toLowerCase());
}

function assertVpsBindingSafe(env, logger = console) {
  const host = String(env.HOST || "").trim();
  const allowPublicBind = env.LIOTAN_ALLOW_PUBLIC_BIND === "true";

  if (isProduction(env) && isPublicHost(host) && !allowPublicBind) {
    throw new Error(
      "Unsafe production bind refused: HOST must be 127.0.0.1/localhost or LIOTAN_ALLOW_PUBLIC_BIND=true must be set explicitly."
    );
  }

  if (isProduction(env) && !isLocalHost(host) && !allowPublicBind) {
    throw new Error(
      `Unsafe production bind refused: HOST=${host} is not a local bind address.`
    );
  }

  if (isProduction(env) && allowPublicBind) {
    logger.warn("PUBLIC BIND OVERRIDE ENABLED", {
      host,
      reason: "LIOTAN_ALLOW_PUBLIC_BIND=true"
    });
  }

  return {
    ok: true,
    host,
    production: isProduction(env),
    localBind: isLocalHost(host),
    publicBind: isPublicHost(host),
    allowPublicBind
  };
}

module.exports = {
  assertVpsBindingSafe,
  isLocalHost,
  isPublicHost
};
