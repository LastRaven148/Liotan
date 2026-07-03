const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(ROOT, "..");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "uploads",
  "dist",
  "build",
  "release"
]);

const RULES = [
  {
    id: "env-file-present",
    severity: "critical",
    filePattern: /(^|\/)\.env$/,
    note: "Never ship runtime .env files inside project archives."
  },
  {
    id: "js-readable-auth-token",
    severity: "critical",
    pattern: /localStorage\.setItem\([^\n]*(token|jwt)|sessionStorage\.setItem\([^\n]*(token|jwt)|Authorization:\s*`Bearer|auth:\s*\{\s*token/i,
    allow: /scripts[\/]privacyAudit\.js$|utils[\/]mailer\.js$/,
    note: "Browser auth must use httpOnly cookies; do not expose auth JWT to JS."
  },
  {
    id: "auth-token-json-response",
    severity: "critical",
    pattern: /res\.json\s*\(\s*\{[^\n]*(token|jwt)|token:\s*req\.token|token:\s*await\s+signToken/i,
    allow: /scripts[\/]privacyAudit\.js$|controllers[\/]authController\.js$/,
    note: "Auth controllers may create tokens only for httpOnly cookies; do not return them in JSON."
  },
  {
    id: "e2ee-localstorage-secret",
    severity: "critical",
    pattern: /localStorage\.(setItem|getItem)\([^\n]*(e2ee|identity|secret|privateKey|chatKey)/i,
    allow: /utils[\/]e2ee\.jsx$|services[\/]e2eeStorage\.jsx$|scripts[\/]privacyAudit\.js$/,
    note: "Do not persist E2EE secrets/plain private keys in localStorage."
  },
  {
    id: "global-socket-emit",
    severity: "high",
    pattern: /\bio\.emit\(/,
    allow: /scripts[\/]privacyAudit\.js$/,
    note: "Global Socket.IO emit can leak metadata; prefer user/group rooms."
  },
  {
    id: "server-storage-internal-id",
    severity: "high",
    pattern: /storageKey|storageType/i,
    allow: /models[\/](Messages|AttachmentUpload|Group|User)\.js$|services[\/]attachmentOwnership\.js$|services[\/]deleteAttachmentFile\.js$|services[\/]deleteMessageAttachments\.js$|controllers[\/]groupController\.js$|controllers[\/]profileController\.js$|controllers[\/]attachmentController\.js$|utils[\/]deleteUploadedFile\.js$|utils[\/]deleteAccountData\.js$|utils[\/]attachmentSecurity\.js$|utils[\/]uploadToR2\.js$|utils[\/]cleanup|scripts[\/]/,
    note: "Storage storageKey/storageType must stay server-side and must not be accepted from client payloads."
  },
  {
    id: "direct-storage-signed-upload",
    severity: "high",
    pattern: /apiKey|secretAccessKey/i,
    allow: /utils[\/]uploadToR2\.js$|utils[\/]attachmentSecurity\.js$|utils[\/]mailer\.js$|scripts[\/]privacyAudit\.js$|\.env\.example$/,
    note: "Prefer server-mediated uploads; direct signed upload exposes provider metadata."
  },
  {
    id: "cookie-state-without-csrf-central-guard",
    severity: "high",
    pattern: /credentials:\s*["']include["']/,
    allow: /utils[\/]apiRequest\.jsx$|scripts[\/]privacyAudit\.js$/,
    note: "Cookie-auth state-changing requests must use the central CSRF/header guard."
  },
  {
    id: "direct-console-client",
    severity: "medium",
    pattern: /console\.(log|error|debug)/,
    allow: /scripts[\/]|utils[\/](logger|devLogger)\.(js|jsx)$/,
    note: "Avoid production console output; use dev-only logger/warnings."
  },
  {
    id: "raw-ip-risk",
    severity: "medium",
    pattern: /req\.ip|x-forwarded-for|remoteAddress/i,
    allow: /utils[\/]securityIds\.js$|middleware[\/]requestContext\.js$|controllers[\/]authController\.js$|scripts[\/]privacyAudit\.js$/,
    note: "Do not store/log raw IP. Hash only for rate limits; authController may derive masked security-notice hints."
  },
  {
    id: "raw-user-agent-risk",
    severity: "medium",
    pattern: /user-agent|userAgent/i,
    allow: /utils[\/]sessionSecurity\.js$|middleware[\/]requestContext\.js$|utils[\/]logger\.js$|config[\/]privacy\.js$|models[\/]Session\.js$|utils[\/]deviceId\.jsx$|controllers[\/]authController\.js$|scripts[\/]privacyAudit\.js$/,
    note: "User-Agent is identifying; keep derived storage disabled by default; authController may derive browser/OS labels for security notices."
  },
  {
    id: "security-secret-fallback-risk",
    severity: "high",
    pattern: /SECURITY_ENCRYPTION_SECRET\s*\|\|\s*process\.env\.JWT_SECRET|JWT_SECRET.*SECURITY_ENCRYPTION_SECRET/i,
    allow: /scripts[\/]privacyAudit\.js$|security[\/]crypto[\/]secureEnvelope\.js$/,
    note: "Production security encryption must not silently fall back to JWT_SECRET."
  },
  {
    id: "security-endpoint-without-recent-auth",
    severity: "high",
    pattern: /router\.post\(["']\/security\//,
    allow: /routes[\/]securityRoutes\.js$|scripts[\/]privacyAudit\.js$/,
    note: "High-risk security endpoints must use recentAuth."
  },
  {
    id: "email-change-instant-apply-risk",
    severity: "high",
    pattern: /user\.emailHash\s*=\s*newEmailHash|\$set:\s*\{[^\n]*emailHash:\s*newEmailHash/i,
    allow: /security[\/]emailChange[\/]emailChangeSecurity\.js$|scripts[\/]privacyAudit\.js$/,
    note: "Email changes must go through pending security window and cancellation flow."
  },
  {
    id: "e2ee-identity-enumeration-risk",
    severity: "high",
    pattern: /res\.json\(\{\s*username:\s*user\.username|username:\s*user\.username,\s*publicKey/i,
    allow: /scripts[\/]privacyAudit\.js$/,
    note: "E2EE identity endpoints must not reveal whether unrelated usernames exist."
  },
  {
    id: "uk-locale-remnant",
    severity: "medium",
    filePattern: /client\/src\/locales\/uk\.jsx$/,
    note: "Ukrainian locale should be fully removed from the client."
  },
  {
    id: "mistyped-env-example",
    severity: "medium",
    filePattern: /server\/\.evn\.exapmle$/,
    note: "Remove mistyped env example to avoid configuration mistakes."
  },
  {
    id: "plaintext-message-write",
    severity: "medium",
    pattern: /text:\s*data\.text|text:\s*req\.body|\.text\s*=/i,
    allow: /scripts[\/]privacyAudit\.js$/,
    note: "Plaintext writes must disappear when E2EE becomes mandatory."
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

    if (/\.(js|jsx|json|env|example|md)$/.test(entry.name) || entry.name === ".env") {
      files.push(fullPath);
    }
  }

  return files;
}

function relative(file) {
  return path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
}

function run() {
  const findings = [];

  for (const file of walk(PROJECT_ROOT)) {
    const rel = relative(file);

    for (const rule of RULES) {
      if (rule.filePattern && rule.filePattern.test(rel)) {
        findings.push({ rule: rule.id, severity: rule.severity, file: rel, line: 1, note: rule.note });
      }
    }

    let lines = [];
    try {
      lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    } catch {
      continue;
    }

    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (!rule.pattern) continue;
        if (rule.allow && rule.allow.test(rel)) continue;
        if (!rule.pattern.test(line)) continue;
        findings.push({ rule: rule.id, severity: rule.severity, file: rel, line: index + 1, note: rule.note });
      }
    });
  }

  const summary = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});

  const blocking = findings.some(item => ["critical", "high"].includes(item.severity));

  console.log(JSON.stringify({
    ok: !blocking,
    summary,
    findings
  }, null, 2));

  if (blocking) {
    process.exitCode = 1;
  }
}

run();
