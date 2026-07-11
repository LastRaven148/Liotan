const UserSecurity = require("../../models/UserSecurity");
const { hashIp } = require("../../utils/privacy");

const ALLOWED_SECURITY_ACTIONS = new Set([
  "suspicious",
  "revoke-session",
  "logout-all",
  "change-password",
  "change-password-submit",
  "reset-2fa",
  "delete-step-1",
  "delete-step-2",
  "delete-final"
]);

function isAllowedRegistrationSecurityAction(action) {
  return ALLOWED_SECURITY_ACTIONS.has(String(action || ""));
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

const SAFE_REGISTRATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

function normalizeRegistrationToken(token) {
  const clean = String(token || "").trim();
  return SAFE_REGISTRATION_TOKEN_PATTERN.test(clean) ? clean : "";
}

function normalizeRegistrationSecurityAction(action) {
  const clean = String(action || "").trim();
  return isAllowedRegistrationSecurityAction(clean) ? clean : "";
}

function getRegistrationActionUrl(token, action) {
  const safeToken = normalizeRegistrationToken(token);
  const safeAction = normalizeRegistrationSecurityAction(action);

  if (!safeToken || !safeAction) {
    return "/";
  }

  return `/auth/register/cancel/${encodeURIComponent(safeToken)}/action/${encodeURIComponent(safeAction)}`;
}

function isConfirmedSecurityAction(req) {
  return req.method === "POST" && String(req.body?.confirm || "") === "1";
}

function sendHtml(res, statusCode, html) {
  res.status(statusCode);
  res.set("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function sendSimpleSecurityPage(res, { ok, title, message }) {
  const safeTitle = escapeHtml(title || "Liotan");
  const safeMessage = escapeHtml(message || "");

  sendHtml(res, ok ? 200 : 400, `<!doctype html>
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

  sendHtml(res, 200, `<!doctype html>
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
  sendHtml(res, 200, `<!doctype html>
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

  sendHtml(res, 200, `<!doctype html>
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

  sendHtml(res, error ? 400 : 200, `<!doctype html>
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
  sendHtml(res, 200, `<!doctype html><html lang="${copy.htmlLang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(copy.deleteStepOneTitle)}</title><style>body{margin:0;min-height:100vh;background:#0e1621;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}.card{width:min(560px,100%);background:#17212b;border:1px solid #7f1d1d;border-radius:22px;padding:28px}h1{color:#ff8f8f}.muted{color:#ffb4b4;line-height:1.55}.btn{width:100%;border:0;border-radius:14px;padding:15px 18px;font-size:15px;font-weight:850;letter-spacing:.01em;cursor:pointer;margin-top:12px;background:#ef4444;color:#fff}.ghost{background:#243447}</style></head><body><main class="card"><h1>${escapeHtml(copy.deleteStepOneTitle)}</h1><p class="muted">${escapeHtml(copy.deleteStepOneText)}</p><form method="get" action="${getRegistrationActionUrl(token, "delete-step-2")}"><button class="btn" type="submit">${escapeHtml(copy.deleteStepOneButton)}</button></form><form method="get" action="${getRegistrationActionUrl(token, "suspicious")}"><button class="btn ghost" type="submit">${escapeHtml(copy.back)}</button></form></main></body></html>`);
}

function sendDeleteStepTwoPage(res, { token, req }) {
  const locale = getSecurityPageLocale(req);
  const copy = securityText(locale);
  sendHtml(res, 200, `<!doctype html><html lang="${copy.htmlLang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(copy.deleteStepTwoTitle)}</title><style>body{margin:0;min-height:100vh;background:#0e1621;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}.card{width:min(560px,100%);background:#17212b;border:1px solid #7f1d1d;border-radius:22px;padding:28px}h1{color:#ff8f8f}.muted{color:#ffb4b4;line-height:1.55}.btn{width:100%;border:0;border-radius:14px;padding:15px 18px;font-size:15px;font-weight:850;letter-spacing:.01em;cursor:pointer;margin-top:12px;background:#dc2626;color:#fff}.ghost{background:#243447}</style></head><body><main class="card"><h1>${escapeHtml(copy.deleteStepTwoTitle)}</h1><p class="muted">${escapeHtml(copy.deleteStepTwoText)}</p><form method="post" action="${getRegistrationActionUrl(token, "delete-final")}"><input type="hidden" name="confirm" value="1" /><button class="btn" type="submit">${escapeHtml(copy.deleteFinalButton)}</button></form><form method="get" action="${getRegistrationActionUrl(token, "suspicious")}"><button class="btn ghost" type="submit">${escapeHtml(copy.cancel)}</button></form></main></body></html>`);
}

module.exports = {
  getRequestLoginInfo,
  getSecurityPageLocale,
  isConfirmedSecurityAction,
  normalizeRegistrationSecurityAction,
  normalizeRegistrationToken,
  securityText,
  sendChangePasswordPage,
  sendDeleteStepOnePage,
  sendDeleteStepTwoPage,
  sendRegistrationSecurityPage,
  sendSecurityConfirmPage,
  sendSimpleSecurityPage,
  sendSuspiciousRegistrationPage
};
