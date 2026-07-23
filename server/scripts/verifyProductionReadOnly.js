"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns").promises;
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const { execFileSync } = require("node:child_process");

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const REQUIRED_SECRET_NAMES = Object.freeze([
  "JWT_SECRET",
  "EMAIL_CODE_HMAC_SECRET",
  "RECOVERY_CODE_HMAC_SECRET",
  "CRYPTO_MANIFEST_HMAC_SECRET",
  "KEY_TRANSPARENCY_SIGNING_KEY"
]);

function option(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

function asAbsolute(value, label) {
  if (!value) return "";
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) throw new Error(`${label} must be absolute`);
  return resolved;
}

function safeJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function countFiles(root, predicate = () => true) {
  if (!root || !fs.existsSync(root)) {
    return { available: false, count: 0, bytes: 0, oldestMtime: null, newestMtime: null };
  }
  const pending = [root];
  let count = 0;
  let bytes = 0;
  let oldest = Infinity;
  let newest = 0;
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (entry.isFile() && predicate(entry.name)) {
        const stat = fs.statSync(absolute);
        count += 1;
        bytes += stat.size;
        oldest = Math.min(oldest, stat.mtimeMs);
        newest = Math.max(newest, stat.mtimeMs);
      }
    }
  }
  return {
    available: true,
    count,
    bytes,
    oldestMtime: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null,
    newestMtime: newest ? new Date(newest).toISOString() : null
  };
}

function inspectRuntimeEnvironment(expectedSha) {
  const present = Object.fromEntries(
    REQUIRED_SECRET_NAMES.map(name => [name, Boolean(String(process.env[name] || ""))])
  );
  const values = REQUIRED_SECRET_NAMES
    .map(name => String(process.env[name] || ""))
    .filter(Boolean);
  return {
    nodeEnvProduction: process.env.NODE_ENV === "production",
    requiredSecretsPresent: present,
    requiredSecretsPairwiseDistinct: new Set(values).size === values.length,
    sourceRevisionPresent: Boolean(process.env.LIOTAN_SOURCE_REVISION),
    sourceRevisionMatches: expectedSha
      ? process.env.LIOTAN_SOURCE_REVISION === expectedSha
      : null,
    legacyR2VariablesAbsent: !process.env.R2_BUCKET && !process.env.R2_PUBLIC_URL,
    mediaAndAvatarBucketsSeparated: Boolean(
      process.env.R2_MEDIA_BUCKET &&
      process.env.R2_AVATAR_BUCKET &&
      process.env.R2_MEDIA_BUCKET !== process.env.R2_AVATAR_BUCKET
    )
  };
}

function inspectPm2(processName, expectedSha) {
  if (!processName) return { requested: false };
  try {
    const processes = JSON.parse(execFileSync("pm2", ["jlist"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024
    }));
    const match = processes.find(item => item?.name === processName);
    return {
      requested: true,
      found: Boolean(match),
      status: match?.pm2_env?.status || null,
      version: match?.pm2_env?.version || null,
      sourceRevisionMatches: match && expectedSha
        ? match.pm2_env?.LIOTAN_SOURCE_REVISION === expectedSha
        : null
    };
  } catch {
    return { requested: true, found: false, errorCode: "PM2_READ_FAILED" };
  }
}

function inspectNginx() {
  try {
    const config = execFileSync("nginx", ["-T"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      maxBuffer: 8 * 1024 * 1024
    });
    return {
      available: true,
      forwardsHost: /proxy_set_header\s+Host\s+\$host\s*;/i.test(config),
      forwardsRealIp: /proxy_set_header\s+X-Real-IP\s+\$remote_addr\s*;/i.test(config),
      forwardsProto: /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme\s*;/i.test(config),
      websocketUpgrade: /proxy_set_header\s+Upgrade\s+\$http_upgrade\s*;/i.test(config),
      sourceMapsDenied: /location\s+~\*?\s+[^{}]*\\\.map[\s\S]*?return\s+404\s*;/i.test(config)
    };
  } catch {
    return { available: false, errorCode: "NGINX_READ_FAILED" };
  }
}

function parseHttpsUrl(raw, label) {
  if (!raw) return null;
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label} must be an HTTPS URL without credentials`);
  }
  return parsed;
}

async function inspectPublicEndpoint(publicUrl) {
  if (!publicUrl) return { requested: false };
  const response = await fetch(publicUrl, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: { Origin: "https://invalid-origin.example" }
  });
  const allowOrigin = response.headers.get("access-control-allow-origin");
  return {
    requested: true,
    status: response.status,
    cloudflareObserved: response.headers.has("cf-ray"),
    cspPresent: response.headers.has("content-security-policy"),
    hstsPresent: response.headers.has("strict-transport-security"),
    invalidOriginNotAllowed: !allowOrigin || allowOrigin !== "*",
    serverHeaderMinimized: !response.headers.has("x-powered-by")
  };
}

async function inspectDnsAndTls(domain) {
  if (!domain) return { requested: false };
  const [ipv4, ipv6] = await Promise.all([
    dns.resolve4(domain).catch(() => []),
    dns.resolve6(domain).catch(() => [])
  ]);
  const tlsResult = await new Promise(resolve => {
    const socket = tls.connect({
      host: domain,
      port: 443,
      servername: domain,
      rejectUnauthorized: true,
      timeout: 10_000
    }, () => {
      const certificate = socket.getPeerCertificate();
      resolve({
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.standardName || socket.getCipher()?.name || null,
        validTo: certificate?.valid_to || null
      });
      socket.end();
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ authorized: false, errorCode: "TLS_TIMEOUT" });
    });
    socket.on("error", () => resolve({ authorized: false, errorCode: "TLS_FAILED" }));
  });
  return {
    requested: true,
    ipv4RecordCount: ipv4.length,
    ipv6RecordCount: ipv6.length,
    tls: tlsResult
  };
}

async function inspectDirectOrigin(originUrl, publicDomain) {
  if (!originUrl) return { requested: false };
  const parsed = new URL(originUrl);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("origin-url must be HTTP(S) without credentials");
  }
  return new Promise(resolve => {
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: parsed.pathname || "/",
      method: "HEAD",
      headers: publicDomain ? { Host: publicDomain } : {},
      servername: publicDomain || parsed.hostname,
      timeout: 10_000
    }, response => {
      response.resume();
      resolve({
        requested: true,
        reachable: true,
        status: response.statusCode,
        blocked: [403, 421].includes(response.statusCode)
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ requested: true, reachable: false, errorCode: "ORIGIN_TIMEOUT" });
    });
    request.on("error", () => resolve({
      requested: true,
      reachable: false,
      errorCode: "ORIGIN_UNREACHABLE"
    }));
    request.end();
  });
}

function inspectRelease(releaseRoot, expectedSha) {
  if (!releaseRoot) return { requested: false };
  const deployment = safeJson(path.join(releaseRoot, "DEPLOYMENT-MANIFEST.json"));
  const client = safeJson(path.join(releaseRoot, "client", "build", "build-meta.json"));
  const sourceMaps = countFiles(
    path.join(releaseRoot, "client", "build"),
    name => name.endsWith(".map")
  );
  return {
    requested: true,
    deploymentManifestPresent: Boolean(deployment),
    clientManifestPresent: Boolean(client),
    deploymentSourceMatches: expectedSha ? deployment?.sourceSha === expectedSha : null,
    clientSourceMatches: expectedSha ? client?.sourceSha === expectedSha : null,
    versionsMatch: Boolean(
      deployment?.version && client?.version && deployment.version === client.version
    ),
    transparencyKeyPinned: client?.keyTransparencyPublicKeyPinned === true,
    sourceMapCount: sourceMaps.count
  };
}

function dryRunPlan() {
  return {
    ok: true,
    mode: "dry-run",
    mutatesProduction: false,
    outputsSecretsOrIdentifiers: false,
    requiredFlag: "--production-read-only",
    checks: [
      "release and client source revision manifests",
      "source-map absence",
      "runtime secret presence and separation without printing values",
      "PM2 aggregate process state",
      "Nginx proxy/header invariants without printing configuration",
      "backup aggregate count/size/retention timestamps without filenames",
      "public Cloudflare/CSP/CORS/HSTS posture",
      "DNS record counts and TLS posture without addresses",
      "optional direct-origin reachability without printing the origin address"
    ]
  };
}

async function main() {
  if (!process.argv.includes("--production-read-only")) {
    process.stdout.write(`${JSON.stringify(dryRunPlan(), null, 2)}\n`);
    return;
  }

  const expectedSha = option("expected-sha");
  if (!SHA_PATTERN.test(expectedSha)) {
    throw new Error("--expected-sha must be the exact 40-character lowercase commit SHA");
  }
  const releaseRoot = asAbsolute(option("release-root"), "release-root");
  const backupRoot = asAbsolute(option("backup-root"), "backup-root");
  const publicUrl = parseHttpsUrl(option("public-url"), "public-url");
  const domain = option("domain") || publicUrl?.hostname || "";
  if (domain && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) {
    throw new Error("--domain must be a valid DNS hostname");
  }

  const report = {
    schema: "liotan-production-read-only-audit/v1",
    mode: "production-read-only",
    mutatesProduction: false,
    outputsSecretsOrIdentifiers: false,
    expectedSha,
    release: inspectRelease(releaseRoot, expectedSha),
    runtime: inspectRuntimeEnvironment(expectedSha),
    pm2: inspectPm2(option("pm2-process"), expectedSha),
    nginx: process.argv.includes("--inspect-nginx")
      ? inspectNginx()
      : { requested: false },
    backups: backupRoot ? countFiles(backupRoot) : { requested: false },
    publicEndpoint: await inspectPublicEndpoint(publicUrl),
    dnsAndTls: await inspectDnsAndTls(domain),
    directOrigin: await inspectDirectOrigin(option("origin-url"), domain)
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: {
      name: String(error?.name || "Error").slice(0, 80),
      code: String(error?.code || "READ_ONLY_AUDIT_FAILED").slice(0, 80)
    }
  })}\n`);
  process.exitCode = 1;
});
