const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { signAuthToken } = require("../utils/authToken");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");
const User = require("../models/User");
const EmailCode = require("../models/EmailCode");
const E2EEKey = require("../models/E2EEKey");
const Session = require("../models/Session");
const UserSecurity = require("../models/UserSecurity");
const PendingEmailChange = require("../models/PendingEmailChange");
const RegistrationCancel = require("../models/RegistrationCancel");
const {
  normalizeEmail,
  hashEmail,
  hmac,
  hashIp
} = require("../utils/privacy");
const {
  createUserSession,
  hashSessionId,
  updateSessionDeviceKey,
  revokeSession,
  revokeAllUserSessions,
  cleanupExpiredSessionsForUser,
  cleanupDuplicateDeviceSessionsForUser,
  getSessionRestrictionState,
  isSessionHashRestricted
} = require("../utils/sessionSecurity");
const {
  sendEmailCode,
  sendEmailChangeCancelNotice,
  sendRegistrationNotice,
  sendLoginNotice,
  sendAccountDeletedNotice
} = require("../utils/mailer");
const {
  isValidUsername,
  isValidPassword,
  isValidEmail,
  isValidEmailCode
} = require("../utils/validators");
const {
  assertAcceptableEmail
} = require("../utils/emailRisk");
const { encryptJson, decryptJson, randomToken, sha256 } = require("../security/crypto/secureEnvelope");
const { verifyTotp } = require("../security/totp/totp");
const deleteAccountData = require("../utils/deleteAccountData");
const { consumeBackupCode } = require("../security/recovery/backupCodes");
const privacy = require("../config/privacy");
const { getRestrictedMessage } = require("../middleware/restrictedSession");
const {
  createPendingEmailChange,
  applyEligiblePendingEmailChanges,
  cancelPendingEmailChange
} = require("../security/emailChange/emailChangeSecurity");
function createCode() {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = String(crypto.randomInt(10000000, 100000000));
    const counts = new Map();
    for (const digit of code) {
      counts.set(digit, (counts.get(digit) || 0) + 1);
    }

    const uniqueDigits = counts.size;
    const maxRepeats = Math.max(...counts.values());

    if (uniqueDigits >= 5 && maxRepeats <= 2) {
      return code;
    }
  }

  return String(crypto.randomInt(10000000, 100000000));
}

async function verifySecondFactorIfEnabled({ user, code, backupCode }) {
  const security = await UserSecurity.findOne({ userId: user._id });
  if (!security?.totp?.enabled) {
    return { ok: true, required: false };
  }

  if (code) {
    try {
      const { secret } = decryptJson(security.totp.secretEnvelope, `totp:${user._id}`);
      const verified = verifyTotp(secret, code, { lastUsedStep: security.totp.lastUsedStep });
      if (verified.ok) {
        security.totp.lastUsedStep = verified.step;
        await security.save();
        return { ok: true, required: true };
      }
    } catch {
      return { ok: false, required: true };
    }
  }

  if (backupCode) {
    const backup = consumeBackupCode(security.totp.backupCodeHashes || [], backupCode);
    if (backup.ok) {
      security.totp.backupCodeHashes = backup.hashes;
      await security.save();
      return { ok: true, required: true };
    }
  }

  return { ok: false, required: true };
}


function getRegistrationCancelUrl(token) {
  const base = String(
    process.env.PUBLIC_API_URL ||
    process.env.API_URL ||
    "https://api.liotan.com"
  ).replace(/\/$/, "");

  return `${base}/auth/register/cancel/${encodeURIComponent(token)}`;
}

function getPublicClientUrl() {
  return String(
    process.env.PUBLIC_CLIENT_URL ||
    process.env.CLIENT_URL ||
    "https://liotan.com"
  ).replace(/\/$/, "");
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.ip || req.socket?.remoteAddress || "").trim();
}

function getIpHint(ip) {
  const value = String(ip || "").trim();
  if (!value) return "Не удалось определить";
  if (value.includes(":")) return `${value.split(":").slice(0, 2).join(":")}:…`;
  const parts = value.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.xxx.xxx`;
  return "Определён частично";
}

function detectBrowserFromUa(ua) {
  const value = String(ua || "");
  if (/Edg\//i.test(value)) return "Microsoft Edge";
  if (/CriOS\//i.test(value)) return "Chrome iOS";
  if (/FxiOS\//i.test(value)) return "Firefox iOS";
  if (/OPR\//i.test(value)) return "Opera";
  if (/Firefox\//i.test(value)) return "Firefox";
  if (/Chrome\//i.test(value) && !/Edg\//i.test(value)) return "Chrome";
  if (/Safari\//i.test(value) && !/Chrome\//i.test(value)) return "Safari";
  return "Browser";
}

function detectOsFromUa(ua) {
  const value = String(ua || "");
  if (/iphone/i.test(value)) return "iPhone";
  if (/ipad/i.test(value)) return "iPad";
  if (/Android/i.test(value)) return "Android";
  if (/Windows NT/i.test(value)) return "Windows";
  if (/Macintosh|Mac OS/i.test(value)) return "macOS";
  if (/Linux/i.test(value)) return "Linux";
  return "Web";
}

function getRequestLoginInfo(req) {
  const ua = String(req.headers["user-agent"] || "");
  const ip = getClientIp(req);
  const osName = detectOsFromUa(ua);
  const browserName = detectBrowserFromUa(ua);
  return {
    deviceName: osName === "Web" ? browserName : `${osName} · ${browserName}`,
    browserName,
    osName,
    ipHint: getIpHint(ip),
    createdIpHash: ip ? hashIp(ip) : ""
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSecurityPageLocale(req) {
  const header = String(req?.headers?.["accept-language"] || "").toLowerCase();
  if (!header) {
    return "en";
  }

  const first = header.split(",")[0] || "";
  if (first.startsWith("ru")) {
    return "ru";
  }

  return "en";
}

function securityText(locale) {
  if (locale === "ru") {
    return {
      htmlLang: "ru",
      unknown: "Не удалось определить",
      unknownDevice: "Неизвестное устройство",
      browser: "Браузер",
      web: "Web",
      loginTitle: "Мы обнаружили вход в Liotan",
      loginLead: "Проверьте детали входа. Если это были не вы — выберите безопасное действие.",
      time: "Время",
      device: "Устройство",
      os: "ОС",
      browserLabel: "Браузер",
      ip: "IP",
      suspicious: "Это не я",
      expiresPrefix: "Ссылка действует до",
      accuracyHint: "IP и устройство могут определяться неточно.",
      suspiciousTitle: "Подозрительный вход",
      suspiciousLead: "Выберите действие. Каждое действие потребует отдельного подтверждения.",
      revokeSession: "Завершить текущую сессию",
      revokeSessionConfirm: "Уверены, что хотите завершить сессию, связанную с этим входом?",
      logoutAll: "Выйти со всех устройств",
      logoutAllConfirm: "Уверены, что хотите выйти со всех устройств? Все активные сессии будут завершены.",
      reset2fa: "Сбросить двухфакторную аутентификацию",
      reset2faConfirm: "Уверены, что хотите сбросить 2FA? Backup codes будут удалены, а все сессии завершены.",
      changePassword: "Сменить пароль",
      changePasswordConfirm: "Мы отправим код восстановления на почту аккаунта. После этого вы введёте код и зададите новый пароль прямо здесь. Продолжить?",
      changePasswordSentTitle: "Код восстановления отправлен",
      changePasswordSentText: "Проверьте почту аккаунта, введите код и задайте новый пароль.",
      deleteAccount: "Удалить аккаунт полностью",
      passwordNote: "",
      confirmTitle: "Подтвердите действие",
      cancel: "Отмена",
      yes: "Да, хочу",
      deleteTitle: "Удалить аккаунт полностью?",
      deleteConfirm: "Удаление аккаунта приведёт к полному удалению профиля, чатов, вложений, сессий и настроек безопасности.",
      deleteStepOneTitle: "Удалить аккаунт?",
      deleteStepOneText: "Удаление аккаунта приведёт к полному удалению всех данных: профиля, чатов, вложений, сессий и настроек безопасности.",
      deleteStepOneButton: "Да, хочу удалить аккаунт",
      back: "Назад",
      deleteStepTwoTitle: "Вы точно уверены?",
      deleteStepTwoText: "После этого действия данные будет невозможно вернуть ни через поддержку, ни другим способом. Мы не сможем восстановить аккаунт.",
      deleteFinalButton: "Да, удалить аккаунт навсегда"
    };
  }

  return {
    htmlLang: "en",
    unknown: "Could not determine",
    unknownDevice: "Unknown device",
    browser: "Browser",
    web: "Web",
    loginTitle: "We detected a Liotan login",
    loginLead: "Review the login details. If this was not you, choose a safe action.",
    time: "Time",
    device: "Device",
    os: "OS",
    browserLabel: "Browser",
    ip: "IP",
    suspicious: "This was not me",
    expiresPrefix: "This link expires at",
    accuracyHint: "IP address and device details may be approximate.",
    suspiciousTitle: "Suspicious login",
    suspiciousLead: "Choose an action. Each action requires separate confirmation.",
    revokeSession: "End this session",
    revokeSessionConfirm: "Are you sure you want to end the session linked to this login?",
    logoutAll: "Sign out of all devices",
    logoutAllConfirm: "Are you sure you want to sign out of all devices? All active sessions will be ended.",
    reset2fa: "Reset two-factor authentication",
    reset2faConfirm: "Are you sure you want to reset 2FA? Backup codes will be deleted, and all sessions will be ended.",
    changePassword: "Change password",
    changePasswordConfirm: "We will send a recovery code to the account email. Then you will enter the code and set a new password here. Continue?",
    changePasswordSentTitle: "Recovery code sent",
    changePasswordSentText: "Check the account email, enter the code, and set a new password.",
    deleteAccount: "Delete account completely",
    passwordNote: "",
    confirmTitle: "Confirm action",
    cancel: "Cancel",
    yes: "Yes, continue",
    deleteTitle: "Delete account completely?",
    deleteConfirm: "Deleting the account will permanently delete the profile, chats, attachments, sessions, and security settings.",
    deleteStepOneTitle: "Delete account?",
    deleteStepOneText: "Deleting the account will permanently delete all data: profile, chats, attachments, sessions, and security settings.",
    deleteStepOneButton: "Yes, I want to delete the account",
    back: "Back",
    deleteStepTwoTitle: "Are you absolutely sure?",
    deleteStepTwoText: "After this action, the data cannot be restored by support or by any other method. We will not be able to recover the account.",
    deleteFinalButton: "Yes, delete the account forever"
  };
}

function formatSecurityDate(value, locale = "en") {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return securityText(locale).unknown;
  }

  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function getRegistrationActionUrl(token, action) {
  return `/auth/register/cancel/${encodeURIComponent(token)}/action/${encodeURIComponent(action)}`;
}

function isConfirmedSecurityAction(req) {
  return req.method === "POST" && String(req.body?.confirm || "") === "1";
}

function sendSimpleSecurityPage(res, { ok, title, message }) {
  const safeTitle = escapeHtml(title || "Liotan");
  const safeMessage = escapeHtml(message || "");

  res.status(ok ? 200 : 400).send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0e1621;color:#fff;font-family:Arial,Helvetica,sans-serif}
    .card{width:min(520px,calc(100vw - 32px));background:#17212b;border:1px solid #243447;border-radius:18px;padding:28px;box-shadow:0 18px 60px rgba(0,0,0,.35)}
    h1{margin:0 0 12px;font-size:25px}.text{color:#9aaabc;line-height:1.55;font-size:16px}.ok{color:#6ee7a8}.bad{color:#ff8f8f}
  </style>
</head>
<body><main class="card"><h1 class="${ok ? "ok" : "bad"}">${safeTitle}</h1><div class="text">${safeMessage}</div></main></body>
</html>`);
}

function sendRegistrationSecurityPage(res, { token, record, req }) {
  const locale = getSecurityPageLocale(req);
  const copy = securityText(locale);
  const createdAt = formatSecurityDate(record.createdAt, locale);
  const expiresAt = formatSecurityDate(record.expiresAt, locale);
  const deviceName = escapeHtml(record.deviceName || copy.unknownDevice);
  const browserName = escapeHtml(record.browserName || copy.browser);
  const osName = escapeHtml(record.osName || copy.web);
  const ipHint = escapeHtml(record.ipHint || copy.unknown);

  res.status(200).send(`<!doctype html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Liotan security notice</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0e1621;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{width:min(620px,100%);background:#17212b;border:1px solid #243447;border-radius:22px;padding:28px;box-shadow:0 18px 70px rgba(0,0,0,.38)}
    h1{font-size:27px;margin:0 0 12px}.muted{color:#9aaabc;line-height:1.55}.details{margin:20px 0;padding:16px;border-radius:16px;background:#101923;border:1px solid #243447}.row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)}.row:last-child{border-bottom:0}.label{color:#8da2b5}.value{text-align:right;color:#fff;font-weight:700}.btn{width:100%;border:0;border-radius:16px;padding:15px 18px;font-size:15px;font-weight:850;letter-spacing:.01em;cursor:pointer;margin-top:12px;box-shadow:0 10px 28px rgba(0,0,0,.18);transition:transform .12s ease,filter .12s ease}.btn:hover{filter:brightness(1.06)}.btn:active{transform:translateY(1px)}.safe{background:#22c55e;color:#06220f}.danger{background:#ef4444;color:#fff}.danger.secondary{background:#7f1d1d}.tiny{font-size:13px;color:#7f93a6;margin-top:16px;line-height:1.45}
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(copy.loginTitle)}</h1>
    <p class="muted">${escapeHtml(copy.loginLead)}</p>
    <section class="details">
      <div class="row"><span class="label">${escapeHtml(copy.time)}</span><span class="value">${escapeHtml(createdAt)}</span></div>
      <div class="row"><span class="label">${escapeHtml(copy.device)}</span><span class="value">${deviceName}</span></div>
      <div class="row"><span class="label">${escapeHtml(copy.os)}</span><span class="value">${osName}</span></div>
      <div class="row"><span class="label">${escapeHtml(copy.browserLabel)}</span><span class="value">${browserName}</span></div>
      <div class="row"><span class="label">${escapeHtml(copy.ip)}</span><span class="value">${ipHint}</span></div>
    </section>
    <form method="get" action="${getRegistrationActionUrl(token, "suspicious")}">
      <button class="btn danger" type="submit">${escapeHtml(copy.suspicious)}</button>
    </form>
    <p class="tiny">${escapeHtml(copy.expiresPrefix)} ${escapeHtml(expiresAt)}. ${escapeHtml(copy.accuracyHint)}</p>
  </main>
</body>
</html>`);
}

function securityPageStyle() {
  return `
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0%,#1b2c3b 0,#0e1621 55%,#09111a 100%);color:#f8fbff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:min(590px,100%);background:linear-gradient(180deg,#17212b,#131d27);border:1px solid #2b4056;border-radius:26px;padding:30px;box-shadow:0 28px 90px rgba(0,0,0,.5)}
    h1{margin:0 0 12px;font-size:28px;line-height:1.12;letter-spacing:-.025em;font-weight:900}
    .muted{color:#a9bacb;line-height:1.6;font-size:15px;margin:0 0 18px}
    .actions{display:grid;gap:12px;margin-top:22px}
    .btn{width:100%;border:0;border-radius:17px;padding:16px 18px;font-size:16px;font-weight:900;letter-spacing:.005em;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.22);transition:transform .12s ease,filter .12s ease,opacity .12s ease;text-align:center}
    .btn:hover{filter:brightness(1.06)}.btn:active{transform:translateY(1px)}
    .danger{background:#ef4444;color:#fff}.danger-dark{background:#991b1b;color:#fff}.safe{background:#22c55e;color:#071a0d}.ghost{background:#26384b;color:#e5f0ff}
    .disabled{background:#334155;color:#91a4b8;cursor:not-allowed;opacity:.68;box-shadow:none}
    .small{font-size:13px;color:#8da2b5;margin-top:16px;line-height:1.5}
    .input{width:100%;border:1px solid #2b4056;background:#0f1a25;color:#fff;border-radius:14px;padding:14px 15px;font-size:15px;margin-top:10px;outline:none}.input:focus{border-color:#3390ec}
    .error{background:#3b1619;border:1px solid #7f1d1d;color:#fecaca;border-radius:14px;padding:12px 14px;margin:12px 0;font-size:14px;line-height:1.45}
  `;
}

function sendSecurityConfirmPage(res, { token, action, title, text, req }) {
  const locale = getSecurityPageLocale(req);
  const copy = securityText(locale);
  res.status(200).send(`<!doctype html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(copy.confirmTitle)}</title>
  <style>${securityPageStyle()}</style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title || copy.confirmTitle)}</h1>
    <p class="muted">${escapeHtml(text || "")}</p>
    <form method="post" action="${getRegistrationActionUrl(token, action)}">
      <input type="hidden" name="confirm" value="1" />
      <button class="btn danger" type="submit">${escapeHtml(copy.yes)}</button>
    </form>
    <form method="get" action="${getRegistrationActionUrl(token, "suspicious")}">
      <button class="btn ghost" type="submit">${escapeHtml(copy.cancel)}</button>
    </form>
  </main>
</body>
</html>`);
}

async function sendSuspiciousRegistrationPage(res, { token, record, req }) {
  const locale = getSecurityPageLocale(req);
  const copy = securityText(locale);
  const security = await UserSecurity.findOne({ userId: record.userId }).lean();
  const has2fa = Boolean(security?.totp?.enabled);
  const actions = [
    {
      key: "revoke-session",
      title: copy.revokeSession,
      text: copy.revokeSessionConfirm,
      enabled: Boolean(record.sessionIdHash)
    },
    {
      key: "logout-all",
      title: copy.logoutAll,
      text: copy.logoutAllConfirm,
      enabled: true
    },
    {
      key: "change-password",
      title: copy.changePassword,
      text: copy.changePasswordConfirm,
      enabled: true
    },
    {
      key: "reset-2fa",
      title: copy.reset2fa,
      text: copy.reset2faConfirm,
      enabled: has2fa
    }
  ];

  const buttons = actions.map((item) => item.enabled ? `
    <form method="get" action="${getRegistrationActionUrl(token, item.key)}">
      <button class="btn danger" type="submit">${escapeHtml(item.title)}</button>
    </form>
  ` : `
    <button class="btn disabled" type="button" aria-disabled="true">${escapeHtml(item.title)}</button>
  `).join("");

  res.status(200).send(`<!doctype html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(copy.suspiciousTitle)}</title>
  <style>${securityPageStyle()}</style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(copy.suspiciousTitle)}</h1>
    <p class="muted">${escapeHtml(copy.suspiciousLead)}</p>
    <div class="actions">
      ${buttons}
      <form method="get" action="${getRegistrationActionUrl(token, "delete-step-1")}">
        <button class="btn danger-dark" type="submit">${escapeHtml(copy.deleteAccount)}</button>
      </form>
    </div>
  </main>
</body>
</html>`);
}

function sendChangePasswordPage(res, { token, req, error = "" }) {
  const locale = getSecurityPageLocale(req);
  const copy = securityText(locale);
  const title = copy.changePassword;
  const lead = copy.changePasswordSentText;
  const codeLabel = locale === "ru" ? "Код из письма" : "Email code";
  const passwordLabel = locale === "ru" ? "Новый пароль" : "New password";
  const repeatLabel = locale === "ru" ? "Повторите новый пароль" : "Repeat new password";
  const submit = locale === "ru" ? "Сменить пароль" : "Change password";

  res.status(error ? 400 : 200).send(`<!doctype html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${securityPageStyle()}</style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(lead)}</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="post" action="${getRegistrationActionUrl(token, "change-password-submit")}">
      <input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="${escapeHtml(codeLabel)}" required />
      <input class="input" name="password" type="password" autocomplete="new-password" maxlength="64" placeholder="${escapeHtml(passwordLabel)}" required />
      <input class="input" name="passwordConfirm" type="password" autocomplete="new-password" maxlength="64" placeholder="${escapeHtml(repeatLabel)}" required />
      <button class="btn danger" type="submit">${escapeHtml(submit)}</button>
    </form>
    <form method="get" action="${getRegistrationActionUrl(token, "suspicious")}">
      <button class="btn ghost" type="submit">${escapeHtml(copy.cancel)}</button>
    </form>
  </main>
</body>
</html>`);
}

function sendDeleteStepOnePage(res, { token, req }) {
  const locale = getSecurityPageLocale(req);
  const copy = securityText(locale);
  res.status(200).send(`<!doctype html><html lang="${copy.htmlLang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(copy.deleteStepOneTitle)}</title><style>body{margin:0;min-height:100vh;background:#0e1621;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}.card{width:min(560px,100%);background:#17212b;border:1px solid #7f1d1d;border-radius:22px;padding:28px}h1{color:#ff8f8f}.muted{color:#ffb4b4;line-height:1.55}.btn{width:100%;border:0;border-radius:14px;padding:15px 18px;font-size:15px;font-weight:850;letter-spacing:.01em;cursor:pointer;margin-top:12px;background:#ef4444;color:#fff}.ghost{background:#243447}</style></head><body><main class="card"><h1>${escapeHtml(copy.deleteStepOneTitle)}</h1><p class="muted">${escapeHtml(copy.deleteStepOneText)}</p><form method="get" action="${getRegistrationActionUrl(token, "delete-step-2")}"><button class="btn" type="submit">${escapeHtml(copy.deleteStepOneButton)}</button></form><form method="get" action="${getRegistrationActionUrl(token, "suspicious")}"><button class="btn ghost" type="submit">${escapeHtml(copy.back)}</button></form></main></body></html>`);
}

function sendDeleteStepTwoPage(res, { token, req }) {
  const locale = getSecurityPageLocale(req);
  const copy = securityText(locale);
  res.status(200).send(`<!doctype html><html lang="${copy.htmlLang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(copy.deleteStepTwoTitle)}</title><style>body{margin:0;min-height:100vh;background:#0e1621;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}.card{width:min(560px,100%);background:#17212b;border:1px solid #7f1d1d;border-radius:22px;padding:28px}h1{color:#ff8f8f}.muted{color:#ffb4b4;line-height:1.55}.btn{width:100%;border:0;border-radius:14px;padding:15px 18px;font-size:15px;font-weight:850;letter-spacing:.01em;cursor:pointer;margin-top:12px;background:#dc2626;color:#fff}.ghost{background:#243447}</style></head><body><main class="card"><h1>${escapeHtml(copy.deleteStepTwoTitle)}</h1><p class="muted">${escapeHtml(copy.deleteStepTwoText)}</p><form method="post" action="${getRegistrationActionUrl(token, "delete-final")}"><input type="hidden" name="confirm" value="1" /><button class="btn" type="submit">${escapeHtml(copy.deleteFinalButton)}</button></form><form method="get" action="${getRegistrationActionUrl(token, "suspicious")}"><button class="btn ghost" type="submit">${escapeHtml(copy.cancel)}</button></form></main></body></html>`);
}

async function createRegistrationCancelLink({ user, email, req, sessionIdHash }) {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const loginInfo = getRequestLoginInfo(req);

  await RegistrationCancel.deleteMany({
    userId: user._id,
    usedAt: null
  });

  await RegistrationCancel.create({
    userId: user._id,
    username: user.username,
    emailHash: user.emailHash,
    emailEnvelope: encryptJson({ email }, `registration-email:${user._id}`),
    tokenHash,
    sessionIdHash: sessionIdHash || "",
    deviceName: loginInfo.deviceName,
    browserName: loginInfo.browserName,
    osName: loginInfo.osName,
    ipHint: loginInfo.ipHint,
    createdIpHash: loginInfo.createdIpHash,
    expiresAt
  });

  return {
    cancelUrl: getRegistrationCancelUrl(token),
    expiresAt
  };
}

async function createLoginSecurityLink({ user, email, req, sessionIdHash }) {
  return createRegistrationCancelLink({
    user,
    email,
    req,
    sessionIdHash
  });
}

function shouldExposeDevEmailCode(result) {
  return (
    !result.sent &&
    process.env.NODE_ENV !== "production" &&
    privacy.exposeDevEmailCodes
  );
}

function authLookupError(message) {
  return privacy.genericAuthErrors ? "invalid credentials" : message;
}

function emailCodeResponse({ result, cleanEmail, code }) {
  return {
    ok: true,
    sent: result.sent,
    maskedEmail: maskEmail(cleanEmail),
    devCode: shouldExposeDevEmailCode(result) ? code : undefined
  };
}
function maskEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const [name, domain] = cleanEmail.split("@");
  if (!name || !domain) {
    return "";
  }
  return `${name[0]}********@${domain}`;
}
async function signToken(req, user) {
  const sessionId = await createUserSession({
    req,
    user
  });

  return signAuthToken(user, sessionId);
}

function sendSessionResponse(res, { token, username }) {
  setAuthCookie(res, token);

  res.json({
    ok: true,
    username
  });
}
async function saveEmailCode({
  emailHash,
  purpose,
  code
}) {
  await EmailCode.deleteMany({
    emailHash,
    purpose
  });
  await EmailCode.create({
    emailHash,
    purpose,
    codeHash: hmac(code)
  });
}
async function verifyEmailCode({
  emailHash,
  purpose,
  code,
  consume = true
}) {
  if (!isValidEmailCode(code)) {
    return false;
  }
  const record = await EmailCode.findOne({
    emailHash,
    purpose
  });
  if (!record) {
    return false;
  }
  if (record.attempts >= 5) {
    await EmailCode.deleteOne({
      _id: record._id
    });
    return false;
  }
  const ok = record.codeHash === hmac(code);
  if (!ok) {
    record.attempts += 1;
    await record.save();
    return false;
  }
  if (consume) {
    await EmailCode.deleteOne({
      _id: record._id
    });
  }
  return true;
}

async function consumeEmailCode({ emailHash, purpose }) {
  await EmailCode.deleteOne({
    emailHash,
    purpose
  });
}
async function sendAuthCode(req, res, next) {
  try {
    const {
      email,
      purpose = "register"
    } = req.body;
    if (!isValidEmail(email) || !["register", "reset"].includes(purpose)) {
      return res.status(400).json({
        error: "invalid email"
      });
    }
    const cleanEmail = normalizeEmail(email);
    if (purpose === "register") {
      await assertAcceptableEmail(cleanEmail);
    }
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const exists = await User.findOne({
      emailHash
    });
    if (privacy.genericAuthErrors) {
      if (purpose === "register" && exists) {
        return res.json({ ok: true, sent: true, maskedEmail: maskEmail(cleanEmail) });
      }
      if (purpose === "reset" && !exists) {
        return res.json({ ok: true, sent: true, maskedEmail: maskEmail(cleanEmail) });
      }
    } else {
      if (purpose === "register" && exists) {
        return res.status(400).json({
          error: authLookupError("email already used")
        });
      }
      if (purpose === "reset" && !exists) {
        return res.status(400).json({
          error: authLookupError("email not found")
        });
      }
    }
    const code = createCode();
    await saveEmailCode({
      emailHash,
      purpose,
      code
    });
    const result = await sendEmailCode({
      to: cleanEmail,
      code,
      purpose
    });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}
async function verifyAuthCode(req, res, next) {
  try {
    const {
      email,
      purpose = "register",
      code
    } = req.body;
    if (!isValidEmail(email) || !isValidEmailCode(code) || !["register", "reset"].includes(purpose)) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const cleanEmail = normalizeEmail(email);
    if (purpose === "register") {
      await assertAcceptableEmail(cleanEmail);
    }
    const emailHash = hashEmail(cleanEmail);
    const exists = await User.findOne({
      emailHash
    });
    if (purpose === "register" && exists) {
      return res.status(400).json({
        error: authLookupError("email already used")
      });
    }
    if (purpose === "reset" && !exists) {
      return res.status(400).json({
        error: authLookupError("email not found")
      });
    }
    const record = await EmailCode.findOne({
      emailHash,
      purpose
    });
    if (!record) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    if (record.attempts >= 5) {
      await EmailCode.deleteOne({
        _id: record._id
      });
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const ok = record.codeHash === hmac(code);
    if (!ok) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({
        error: "invalid code"
      });
    }
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
async function sendLoginCode(req, res, next) {
  try {
    const {
      email,
      password
    } = req.body;
    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanEmail = normalizeEmail(email);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const user = await User.findOne({
      emailHash,
      emailVerified: true
    });
    if (!user) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const code = createCode();
    await saveEmailCode({
      emailHash,
      purpose: "login",
      code
    });
    const result = await sendEmailCode({
      to: cleanEmail,
      code,
      purpose: "login"
    });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}
async function register(req, res, next) {
  try {
    const {
      username,
      password,
      email,
      code
    } = req.body;
    if (!isValidUsername(username) || !isValidPassword(password) || !isValidEmail(email) || !isValidEmailCode(code)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanUsername = username.trim();
    const cleanEmail = normalizeEmail(email);
    await assertAcceptableEmail(cleanEmail);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const exists = await User.findOne({
      $or: [{
        username: cleanUsername
      }, {
        emailHash
      }]
    });
    if (exists) {
      return res.status(400).json({
        error: authLookupError("exists")
      });
    }
    const verified = await verifyEmailCode({
      emailHash,
      purpose: "register",
      code
    });
    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: cleanUsername,
      password: hash,
      emailHash,
      emailVerified: true,
      lastSeen: new Date()
    });
    const sessionId = await createUserSession({ req, user });
    const token = signAuthToken(user, sessionId);
    const registrationCancel = await createRegistrationCancelLink({
      user,
      email: cleanEmail,
      req,
      sessionIdHash: hashSessionId(sessionId)
    });

    await sendRegistrationNotice({
      to: cleanEmail,
      username: user.username,
      cancelUrl: registrationCancel.cancelUrl,
      expiresAt: registrationCancel.expiresAt
    }).catch(() => null);

    sendSessionResponse(res, {
      token,
      username: user.username
    });
  } catch (err) {
    next(err);
  }
}
async function login(req, res, next) {
  try {
    const {
      email,
      password,
      code,
      totpCode,
      backupCode
    } = req.body;
    if (!isValidEmail(email) || !isValidPassword(password) || !isValidEmailCode(code)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanEmail = normalizeEmail(email);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const user = await User.findOne({
      emailHash,
      emailVerified: true
    });
    if (!user) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const verified = await verifyEmailCode({
      emailHash,
      purpose: "login",
      code,
      consume: false
    });
    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const secondFactor = await verifySecondFactorIfEnabled({
      user,
      code: totpCode,
      backupCode
    });
    if (!secondFactor.ok) {
      return res.status(401).json({
        error: "second factor required",
        secondFactorRequired: true
      });
    }
    await consumeEmailCode({
      emailHash,
      purpose: "login"
    });
    user.lastSeen = new Date();
    await user.save();

    const sessionId = await createUserSession({ req, user });
    const token = signAuthToken(user, sessionId);
    const loginSecurity = await createLoginSecurityLink({
      user,
      email: cleanEmail,
      req,
      sessionIdHash: hashSessionId(sessionId)
    });

    await sendLoginNotice({
      to: cleanEmail,
      username: user.username,
      at: new Date(),
      securityUrl: loginSecurity.cancelUrl,
      expiresAt: loginSecurity.expiresAt
    }).catch(() => null);

    sendSessionResponse(res, {
      token,
      username: user.username
    });
  } catch (err) {
    next(err);
  }
}
async function resetPassword(req, res, next) {
  try {
    const {
      email,
      code,
      password
    } = req.body;
    if (!isValidEmail(email) || !isValidEmailCode(code) || !isValidPassword(password)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanEmail = normalizeEmail(email);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const user = await User.findOne({
      emailHash
    });
    if (!user) {
      return res.status(400).json({
        error: authLookupError("email not found")
      });
    }
    const verified = await verifyEmailCode({
      emailHash,
      purpose: "reset",
      code
    });
    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const secondFactor = await verifySecondFactorIfEnabled({
      user,
      code: req.body?.totpCode,
      backupCode: req.body?.backupCode
    });
    if (!secondFactor.ok) {
      return res.status(401).json({
        error: "second factor required",
        secondFactorRequired: true
      });
    }
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    await revokeAllUserSessions({
      userId: user._id
    });
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
function signEmailChangeToken(user, currentEmailHash) {
  return jwt.sign({
    userId: user._id.toString(),
    username: user.username,
    emailHash: currentEmailHash,
    scope: "email-change"
  }, process.env.JWT_SECRET, {
    expiresIn: "15m",
    algorithm: "HS256"
  });
}

function verifyEmailChangeToken(emailChangeToken, req) {
  try {
    const payload = jwt.verify(String(emailChangeToken || ""), process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });
    if (payload?.scope !== "email-change" || payload?.userId !== req.user.userId || payload?.username !== req.user.username) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function startEmailChangeCurrent(req, res, next) {
  try {
    const cleanEmail = normalizeEmail(req.body?.currentEmail);
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: "invalid email" });
    }
    const emailHash = hashEmail(cleanEmail);
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user || user.emailHash !== emailHash) {
      return res.status(400).json({ error: "invalid email" });
    }
    const code = createCode();
    await saveEmailCode({ emailHash, purpose: "change_current", code });
    const result = await sendEmailCode({ to: cleanEmail, code, purpose: "change_current" });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}

async function verifyEmailChangeCurrent(req, res, next) {
  try {
    const cleanEmail = normalizeEmail(req.body?.currentEmail);
    const code = req.body?.code;
    if (!isValidEmail(cleanEmail) || !isValidEmailCode(code)) {
      return res.status(400).json({ error: "invalid code" });
    }
    const emailHash = hashEmail(cleanEmail);
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user || user.emailHash !== emailHash) {
      return res.status(400).json({ error: "invalid email" });
    }
    const verified = await verifyEmailCode({ emailHash, purpose: "change_current", code });
    if (!verified) {
      return res.status(400).json({ error: "invalid code" });
    }
    res.json({ ok: true, emailChangeToken: signEmailChangeToken(user, emailHash) });
  } catch (err) {
    next(err);
  }
}

async function sendEmailChangeNewCode(req, res, next) {
  try {
    const tokenPayload = verifyEmailChangeToken(req.body?.token, req);
    const cleanEmail = normalizeEmail(req.body?.newEmail);
    if (!tokenPayload || !isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: "invalid request" });
    }
    await assertAcceptableEmail(cleanEmail);
    const newEmailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash: newEmailHash });
    const exists = await User.findOne({ emailHash: newEmailHash, _id: { $ne: req.user.userId } });
    if (exists) {
      return res.status(400).json({ error: authLookupError("email already used") });
    }
    const code = createCode();
    await saveEmailCode({ emailHash: newEmailHash, purpose: "change_new", code });
    const result = await sendEmailCode({ to: cleanEmail, code, purpose: "change_new" });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}

async function confirmEmailChange(req, res, next) {
  try {
    const tokenPayload = verifyEmailChangeToken(req.body?.token, req);
    const cleanEmail = normalizeEmail(req.body?.newEmail);
    const currentEmail = normalizeEmail(req.body?.currentEmail);
    const code = req.body?.code;
    if (!tokenPayload || !isValidEmail(cleanEmail) || !isValidEmailCode(code) || !isValidEmail(currentEmail)) {
      return res.status(400).json({ error: "invalid request" });
    }
    await assertAcceptableEmail(cleanEmail);
    const newEmailHash = hashEmail(cleanEmail);
    const currentEmailHash = hashEmail(currentEmail);
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user || user.emailHash !== tokenPayload.emailHash || currentEmailHash !== tokenPayload.emailHash) {
      return res.status(400).json({ error: "invalid request" });
    }
    await applyEligiblePendingEmailChanges({ emailHash: newEmailHash });
    const exists = await User.findOne({ emailHash: newEmailHash, _id: { $ne: req.user.userId } });
    if (exists) {
      return res.status(400).json({ error: authLookupError("email already used") });
    }
    const verified = await verifyEmailCode({ emailHash: newEmailHash, purpose: "change_new", code });
    if (!verified) {
      return res.status(400).json({ error: "invalid code" });
    }
    const secondFactor = await verifySecondFactorIfEnabled({
      user,
      code: req.body?.totpCode,
      backupCode: req.body?.backupCode
    });
    if (!secondFactor.ok) {
      return res.status(401).json({
        error: "second factor required",
        secondFactorRequired: true
      });
    }
    const { pending, cancelUrl } = await createPendingEmailChange({
      user,
      oldEmailHash: tokenPayload.emailHash,
      newEmail: cleanEmail,
      newEmailHash,
      exceptSessionId: req.user.sid
    });
    await sendEmailChangeCancelNotice({
      to: currentEmail,
      cancelUrl,
      applyAfter: pending.applyAfter
    }).catch(() => null);
    res.json({
      ok: true,
      pending: true,
      applyAfter: pending.applyAfter,
      cancelExpiresAt: pending.cancelExpiresAt
    });
  } catch (err) {
    next(err);
  }
}

async function cancelEmailChange(req, res, next) {
  try {
    const ok = await cancelPendingEmailChange(req.params.token);
    res.status(ok ? 200 : 400).json({ ok });
  } catch (err) {
    next(err);
  }
}


async function findRegistrationSecurityRecord(token) {
  const tokenHash = sha256(token || "");
  return RegistrationCancel.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });
}

function getRecordEmail(record) {
  try {
    const data = decryptJson(record.emailEnvelope, `registration-email:${record.userId}`);
    return String(data.email || "");
  } catch {
    return "";
  }
}

async function markRegistrationActionUsed(record, action) {
  const now = new Date();

  await RegistrationCancel.updateOne(
    {
      _id: record._id,
      usedAt: null
    },
    {
      $set: {
        usedAt: now,
        actionTaken: action,
        actionTakenAt: now
      }
    }
  );

  await RegistrationCancel.updateMany(
    {
      userId: record.userId,
      usedAt: null,
      _id: { $ne: record._id }
    },
    {
      $set: {
        usedAt: now,
        actionTaken: "expired-by-action",
        actionTakenAt: now
      }
    }
  );
}

async function cancelRegistration(req, res, next) {
  try {
    const record = await findRegistrationSecurityRecord(req.params.token);

    if (!record) {
      return sendSimpleSecurityPage(res, {
        ok: false,
        title: "Ссылка недействительна",
        message: "Эта ссылка безопасности уже использована или истекла."
      });
    }

    return sendRegistrationSecurityPage(res, {
      token: req.params.token,
      record,
      req
    });
  } catch (err) {
    next(err);
  }
}


function isSecurityPageActionBlockedByRestrictedSession(action) {
  return action !== "";
}

async function sendRestrictedSecurityActionPageIfNeeded({
  req,
  res,
  record,
  action
}) {
  if (!isSecurityPageActionBlockedByRestrictedSession(action)) {
    return false;
  }

  const restricted =
    await isSessionHashRestricted({
      userId: record.userId,
      sessionIdHash: record.sessionIdHash
    });

  if (!restricted) {
    return false;
  }

  const locale = getSecurityPageLocale(req);

  sendSimpleSecurityPage(res, {
    ok: false,
    title: locale === "ru" ? "Доступ запрещен" : "Access blocked",
    message: getRestrictedMessage(req)
  });

  return true;
}

async function handleRegistrationSecurityAction(req, res, next) {
  try {
    const action = String(req.params.action || "");
    const record = await findRegistrationSecurityRecord(req.params.token);
    const locale = getSecurityPageLocale(req);
    const copy = securityText(locale);

    if (!record) {
      return sendSimpleSecurityPage(res, {
        ok: false,
        title: locale === "ru" ? "Ссылка недействительна" : "Invalid link",
        message: locale === "ru" ? "Эта ссылка безопасности уже использована или истекла." : "This security link has already been used or has expired."
      });
    }

    if (await sendRestrictedSecurityActionPageIfNeeded({ req, res, record, action })) {
      return;
    }

    if (action === "suspicious") {
      return sendSuspiciousRegistrationPage(res, { token: req.params.token, record, req });
    }

    if (action === "revoke-session") {
      if (!isConfirmedSecurityAction(req)) {
        return sendSecurityConfirmPage(res, { token: req.params.token, action, title: copy.revokeSession, text: copy.revokeSessionConfirm, req });
      }
      const result = record.sessionIdHash
        ? await Session.updateOne(
            { userId: record.userId, sessionIdHash: record.sessionIdHash, revokedAt: null },
            { $set: { revokedAt: new Date() } }
          )
        : { modifiedCount: 0 };
      await markRegistrationActionUsed(record, "revoke-session");
      return sendSimpleSecurityPage(res, {
        ok: true,
        title: locale === "ru" ? "Сессия завершена" : "Session ended",
        message: locale === "ru"
          ? `Сессия, связанная с этим входом, была завершена. Изменено сессий: ${result.modifiedCount || 0}.`
          : `The session linked to this login was ended. Sessions changed: ${result.modifiedCount || 0}.`
      });
    }

    if (action === "logout-all") {
      if (!isConfirmedSecurityAction(req)) {
        return sendSecurityConfirmPage(res, { token: req.params.token, action, title: copy.logoutAll, text: copy.logoutAllConfirm, req });
      }
      await revokeAllUserSessions({ userId: record.userId });
      await markRegistrationActionUsed(record, "logout-all");
      return sendSimpleSecurityPage(res, {
        ok: true,
        title: locale === "ru" ? "Все сессии завершены" : "All sessions ended",
        message: locale === "ru" ? "Аккаунт был выведен со всех устройств." : "The account was signed out from all devices."
      });
    }

    if (action === "change-password") {
      if (!isConfirmedSecurityAction(req)) {
        return sendSecurityConfirmPage(res, { token: req.params.token, action, title: copy.changePassword, text: copy.changePasswordConfirm, req });
      }
      const email = getRecordEmail(record);
      if (!email) {
        return sendSimpleSecurityPage(res, {
          ok: false,
          title: locale === "ru" ? "Почта недоступна" : "Email unavailable",
          message: locale === "ru" ? "Почту аккаунта не удалось восстановить из защищённой записи." : "The account email could not be recovered from the protected record."
        });
      }
      const code = createCode();
      await saveEmailCode({
        emailHash: record.emailHash,
        purpose: "reset",
        code
      });
      await sendEmailCode({
        to: email,
        code,
        purpose: "reset"
      });
      return sendChangePasswordPage(res, { token: req.params.token, req });
    }

    if (action === "change-password-submit") {
      const emailCode = String(req.body?.code || "").trim();
      const password = String(req.body?.password || "");
      const passwordConfirm = String(req.body?.passwordConfirm || "");
      if (!isValidEmailCode(emailCode)) {
        return sendChangePasswordPage(res, { token: req.params.token, req, error: locale === "ru" ? "Введите 8-значный код из письма." : "Enter the 8-digit email code." });
      }
      if (!isValidPassword(password) || password !== passwordConfirm) {
        return sendChangePasswordPage(res, { token: req.params.token, req, error: locale === "ru" ? "Пароль должен быть от 8 до 64 символов, оба поля должны совпадать." : "Password must be 8–64 characters, and both fields must match." });
      }
      const verified = await verifyEmailCode({
        emailHash: record.emailHash,
        purpose: "reset",
        code: emailCode
      });
      if (!verified) {
        return sendChangePasswordPage(res, { token: req.params.token, req, error: locale === "ru" ? "Код неверный или истёк." : "The code is invalid or expired." });
      }
      const user = await User.findOne({ _id: record.userId, username: record.username });
      if (!user) {
        return sendSimpleSecurityPage(res, {
          ok: false,
          title: locale === "ru" ? "Аккаунт не найден" : "Account not found",
          message: locale === "ru" ? "Аккаунт уже удалён или недоступен." : "The account is already deleted or unavailable."
        });
      }
      user.password = await bcrypt.hash(password, 12);
      await user.save();
      await revokeAllUserSessions({ userId: record.userId });
      await markRegistrationActionUsed(record, "change-password");
      return sendSimpleSecurityPage(res, {
        ok: true,
        title: locale === "ru" ? "Пароль изменён" : "Password changed",
        message: locale === "ru" ? "Пароль был изменён, все сессии аккаунта завершены." : "The password was changed, and all account sessions were ended."
      });
    }

    if (action === "reset-2fa") {
      const security = await UserSecurity.findOne({ userId: record.userId });
      if (!security?.totp?.enabled) {
        return sendSimpleSecurityPage(res, {
          ok: false,
          title: locale === "ru" ? "2FA не включена" : "2FA is not enabled",
          message: locale === "ru" ? "Для этого аккаунта двухфакторная аутентификация не включена." : "Two-factor authentication is not enabled for this account."
        });
      }
      if (!isConfirmedSecurityAction(req)) {
        return sendSecurityConfirmPage(res, { token: req.params.token, action, title: copy.reset2fa, text: copy.reset2faConfirm, req });
      }
      security.totp.enabled = false;
      security.totp.secretEnvelope = null;
      security.totp.backupCodeHashes = [];
      security.totp.lastUsedStep = null;
      await security.save();
      await revokeAllUserSessions({ userId: record.userId });
      await markRegistrationActionUsed(record, "reset-2fa");
      return sendSimpleSecurityPage(res, {
        ok: true,
        title: locale === "ru" ? "2FA сброшена" : "2FA reset",
        message: locale === "ru" ? "Двухфакторная аутентификация отключена, backup codes удалены, все сессии завершены." : "Two-factor authentication was disabled, backup codes were deleted, and all sessions were ended."
      });
    }

    if (action === "delete-step-1") {
      return sendDeleteStepOnePage(res, { token: req.params.token, req });
    }

    if (action === "delete-step-2") {
      return sendDeleteStepTwoPage(res, { token: req.params.token, req });
    }

    if (action === "delete-final") {
      if (!isConfirmedSecurityAction(req)) {
        return sendDeleteStepTwoPage(res, { token: req.params.token, req });
      }
      const email = getRecordEmail(record);
      await markRegistrationActionUsed(record, "delete-final");
      const result = await deleteAccountData(record.username);

      if (email) {
        await sendAccountDeletedNotice({
          to: email,
          username: record.username,
          at: new Date()
        }).catch(() => null);
      }

      return sendSimpleSecurityPage(res, {
        ok: result.ok,
        title: result.ok ? (locale === "ru" ? "Аккаунт удалён" : "Account deleted") : (locale === "ru" ? "Не удалось удалить аккаунт" : "Could not delete account"),
        message: result.ok
          ? (locale === "ru" ? "Аккаунт Liotan и связанные данные были удалены." : "The Liotan account and related data were deleted.")
          : (locale === "ru" ? "Аккаунт уже не найден или действие больше не может быть применено." : "The account was not found, or the action can no longer be applied.")
      });
    }

    return sendSimpleSecurityPage(res, {
      ok: false,
      title: locale === "ru" ? "Неизвестное действие" : "Unknown action",
      message: locale === "ru" ? "Выбранное действие не поддерживается." : "The selected action is not supported."
    });
  } catch (err) {
    return sendSimpleSecurityPage(res, {
      ok: false,
      title: getSecurityPageLocale(req) === "ru" ? "Ошибка безопасности" : "Security error",
      message: getSecurityPageLocale(req) === "ru"
        ? "Не удалось выполнить действие. Попробуйте открыть ссылку ещё раз или войдите в аккаунт и проверьте активные устройства."
        : "The action could not be completed. Try opening the link again, or sign in and review active devices."
    });
  }
}

async function getCurrentSession(req, res, next) {
  try {
    const security = await UserSecurity.findOne({
      userId: req.user.userId
    }).select("totp.enabled totp.backupCodeHashes").lean();

    const sessionRestriction =
      await getSessionRestrictionState({
        userId: req.user.userId,
        username: req.user.username,
        sessionId: req.user.sid
      });

    res.json({
      ok: true,
      username: req.user.username,
      security: {
        totpEnabled: Boolean(security?.totp?.enabled),
        backupCodesRemaining: security?.totp?.backupCodeHashes?.length || 0
      },
      restrictedSession: sessionRestriction
    });
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    await cleanupExpiredSessionsForUser(req.user.userId);
    await cleanupDuplicateDeviceSessionsForUser(req.user.userId);

    const sessions = await Session.find({
      userId: req.user.userId,
      revokedAt: null,
      expiresAt: {
        $gt: new Date()
      }
    }).select("sessionIdHash deviceName createdAt lastSeenAt expiresAt transportMode devicePublicKey deviceKeyFingerprint").sort({
      lastSeenAt: -1
    }).lean();
    const currentHash = hashSessionId(req.user.sid);
    res.json({
      sessions: sessions.map(session => ({
        id: session.sessionIdHash,
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        transportMode: session.transportMode || "auto",
        hasDevicePublicKey: Boolean(session.devicePublicKey),
        deviceKeyFingerprint: session.deviceKeyFingerprint || "",
        current: session.sessionIdHash === currentHash
      }))
    });
  } catch (err) {
    next(err);
  }
}

async function updateCurrentSessionDeviceKey(req, res, next) {
  try {
    const ok =
      await updateSessionDeviceKey({
        userId: req.user.userId,
        sessionId: req.user.sid,
        devicePublicKey: req.body?.devicePublicKey,
        deviceKeyFingerprint: req.body?.deviceKeyFingerprint
      });

    if (!ok) {
      return res.status(400).json({
        error: "invalid device key"
      });
    }

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}

async function logoutAllSessions(req, res, next) {
  try {
    await revokeAllUserSessions({
      userId: req.user.userId
    });

    clearAuthCookie(res);

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}

async function logoutCurrentSession(req, res, next) {
  try {
    await revokeSession({
      userId: req.user.userId,
      sessionIdHash: hashSessionId(req.user.sid)
    });

    clearAuthCookie(res);

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
async function revokeOneSession(req, res, next) {
  try {
    const sessionIdHash = String(req.params.id || "").trim();
    if (!sessionIdHash || sessionIdHash.length > 200) {
      return res.status(400).json({
        error: "invalid session"
      });
    }
    await revokeSession({
      userId: req.user.userId,
      sessionIdHash
    });
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
async function logoutOtherSessions(req, res, next) {
  try {
    await revokeAllUserSessions({
      userId: req.user.userId,
      exceptSessionId: req.user.sid
    });
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
module.exports = {
  sendAuthCode,
  verifyAuthCode,
  sendLoginCode,
  register,
  login,
  resetPassword,
  getCurrentSession,
  listSessions,
  logoutCurrentSession,
  revokeOneSession,
  logoutOtherSessions,
  logoutAllSessions,
  updateCurrentSessionDeviceKey,
  startEmailChangeCurrent,
  verifyEmailChangeCurrent,
  sendEmailChangeNewCode,
  confirmEmailChange,
  cancelEmailChange,
  cancelRegistration,
  handleRegistrationSecurityAction
};
