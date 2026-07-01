const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "uploads",
  "dist",
  "build"
]);

const RULES = [
  {
    id: "direct-console",
    severity: "medium",
    pattern: /console\.(log|warn|error|debug)/,
    allow: /utils[\\/]logger\.js$/,
    note: "Use utils/logger so sensitive fields are redacted."
  },
  {
    id: "raw-ip",
    severity: "high",
    pattern: /req\.ip|x-forwarded-for|remoteAddress/i,
    note: "Do not store or log raw IP. Hash only when explicitly enabled."
  },
  {
    id: "raw-user-agent",
    severity: "medium",
    pattern: /user-agent|userAgent/i,
    allow: /utils[\\/]sessionSecurity\.js$|middleware[\\/]requestContext\.js$|utils[\\/]logger\.js$/,
    note: "User-Agent is identifying; keep derived storage disabled by default."
  },
  {
    id: "plaintext-message-risk",
    severity: "high",
    pattern: /\btext\b|\bmessage\b/i,
    allow: /models[\\/]Messages\.js$|utils[\\/]logger\.js$|scripts[\\/]privacyAudit\.js$/,
    note: "Message text should move to encryptedContent/contentMode=e2ee."
  },
  {
    id: "email-risk",
    severity: "medium",
    pattern: /email/i,
    allow: /authController\.js$|EmailCode\.js$|mailer\.js$|emailRisk\.js$|privacy\.js$|validators\.js$|scripts[\\/]privacyAudit\.js$/,
    note: "Email must remain hashed at rest and neutral in provider payloads."
  }
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (/\.(js|json|env|example)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function run() {
  const findings = [];

  for (const file of walk(ROOT)) {
    const rel = relative(file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.allow && rule.allow.test(rel)) continue;
        if (!rule.pattern.test(line)) continue;

        findings.push({
          rule: rule.id,
          severity: rule.severity,
          file: rel,
          line: index + 1,
          note: rule.note
        });
      }
    });
  }

  const summary = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    ok: true,
    summary,
    findings
  }, null, 2));
}

run();
