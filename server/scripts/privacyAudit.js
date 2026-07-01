const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(ROOT, "..");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "uploads",
  "dist",
  "build"
]);

const RULES = [
  {
    id: "env-file-present",
    severity: "critical",
    filePattern: /(^|\/)\.env$/,
    note: "Never ship runtime .env files inside project archives."
  },
  {
    id: "auth-token-response",
    severity: "critical",
    pattern: /token:\s*req\.token|setApiAuthToken\([^\)]*data\.token|Authorization:\s*`Bearer/i,
    allow: /utils[\/]mailer\.js$/,
    note: "Browser auth must use httpOnly cookies; do not expose auth JWT to JS."
  },
  {
    id: "e2ee-localstorage-secret",
    severity: "critical",
    pattern: /localStorage\.setItem\([^\n]*(e2ee|identity|secret)/i,
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
    id: "cookie-state-without-csrf",
    severity: "high",
    pattern: /credentials:\s*["']include["']/,
    allow: /utils[\/]apiRequest\.jsx$/,
    note: "Cookie-auth state-changing requests must use the central CSRF/header guard."
  },
  {
    id: "direct-cloudinary-signed-upload",
    severity: "high",
    pattern: /api_key|apiKey|api_sign_request|cloudName/i,
    allow: /controllers[\/]attachmentController\.js$|config[\/]cloudinary\.js$|utils[\/]uploadToCloudinary\.js$|utils[\/]attachmentSecurity\.js$|utils[\/]mailer\.js$|hooks[\/]useAuth\.jsx$|scripts[\/]privacyAudit\.js$|\.env\.example$/,
    note: "Prefer server-mediated uploads; direct signed upload exposes provider metadata."
  },
  {
    id: "direct-console-client",
    severity: "medium",
    pattern: /console\.(log|error|debug)/,
    allow: /scripts[\/]|utils[\/]logger\.js$/,
    note: "Avoid production console output; use dev-only logger/warnings."
  },
  {
    id: "raw-ip-risk",
    severity: "medium",
    pattern: /req\.ip|x-forwarded-for|remoteAddress/i,
    allow: /utils[\/]securityIds\.js$|middleware[\/]requestContext\.js$|scripts[\/]privacyAudit\.js$/,
    note: "Do not store/log raw IP. Hash only for rate limits."
  },
  {
    id: "raw-user-agent-risk",
    severity: "medium",
    pattern: /user-agent|userAgent/i,
    allow: /utils[\/]sessionSecurity\.js$|middleware[\/]requestContext\.js$|utils[\/]logger\.js$|config[\/]privacy\.js$|models[\/]Session\.js$|utils[\/]deviceId\.jsx$|scripts[\/]privacyAudit\.js$/,
    note: "User-Agent is identifying; keep derived storage disabled by default."
  },
  {
    id: "plaintext-message-write",
    severity: "medium",
    pattern: /\.text\s*=|text:\s*data\.text|text:\s*req\.body/i,
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
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          file: rel,
          line: 1,
          note: rule.note
        });
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
    ok: findings.every(item => item.severity !== "critical"),
    summary,
    findings
  }, null, 2));
}

run();
