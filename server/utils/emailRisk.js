const dns = require("dns").promises;

const DEFAULT_BLOCKED_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "sharklasers.com", "getairmail.com",
  "dispostable.com", "fakeinbox.com", "throwawaymail.com", "maildrop.cc",
  "mintemail.com", "mytemp.email", "emailondeck.com", "moakt.com",
  "anonaddy.com", "simplelogin.com", "duck.com"
]);

const SUSPICIOUS_TLDS = new Set([
  "xyz", "top", "click", "link", "work", "cam", "monster", "lol",
  "quest", "rest", "cyou", "sbs", "shop", "buzz", "icu"
]);

const TRUSTED_PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "me.com", "mac.com", "yahoo.com", "proton.me", "protonmail.com",
  "mail.ru", "bk.ru", "inbox.ru", "list.ru", "yandex.ru", "ya.ru", "rambler.ru"
]);

function parseExtraDomains(value = "") {
  return String(value)
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function getDomain(email = "") {
  const parts = String(email).toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

function looksLikeIpDomain(domain = "") {
  return /^\d+\.\d+\.\d+\.\d+$/.test(domain) || domain.startsWith("[");
}

async function hasMx(domain) {
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

async function assessEmailRisk(email) {
  const domain = getDomain(email);
  const extraBlocked = new Set(parseExtraDomains(process.env.BLOCKED_EMAIL_DOMAINS));
  const tld = domain.split(".").pop();
  const reasons = [];

  if (!domain || !domain.includes(".")) reasons.push("invalid_domain");
  if (looksLikeIpDomain(domain)) reasons.push("ip_domain");
  if (DEFAULT_BLOCKED_DOMAINS.has(domain) || extraBlocked.has(domain)) reasons.push("disposable_domain");
  if (SUSPICIOUS_TLDS.has(tld) && !TRUSTED_PUBLIC_DOMAINS.has(domain)) reasons.push("suspicious_tld");

  const strictMx = String(process.env.EMAIL_REQUIRE_MX || "true") !== "false";
  if (strictMx) {
    const mxOk = await hasMx(domain);
    if (!mxOk) reasons.push("no_mx_records");
  }

  return {
    ok: reasons.length === 0,
    domain,
    reasons
  };
}

async function assertAcceptableEmail(email) {
  const result = await assessEmailRisk(email);
  if (!result.ok) {
    const err = new Error("email is not allowed");
    err.status = 400;
    err.code = "EMAIL_RISK_BLOCKED";
    err.details = result.reasons;
    throw err;
  }
  return result;
}

module.exports = {
  assessEmailRisk,
  assertAcceptableEmail
};
