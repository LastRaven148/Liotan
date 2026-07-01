const logger =
  require("./logger");

const privacy =
  require("../config/privacy");

function getEnv(name) {
  return String(
    process.env[name] || ""
  ).trim();
}

function getMailFrom() {
  return (
    getEnv("MAIL_FROM") ||
    "Liotan <security@liotan.com>"
  );
}

function getResendApiKey() {
  return getEnv("RESEND_API_KEY");
}

function hasResendConfig() {
  return Boolean(
    getResendApiKey()
  );
}

function hasSmtpConfig() {
  return Boolean(
    getEnv("SMTP_HOST") &&
    getEnv("SMTP_USER") &&
    getEnv("SMTP_PASS")
  );
}

function hasMailConfig() {
  return hasResendConfig() || hasSmtpConfig();
}

function getSubject(purpose) {
  if (privacy.genericEmailSubjects) {
    return "Liotan security code";
  }

  if (purpose === "reset") {
    return "Liotan password reset code";
  }

  if (purpose === "login") {
    return "Liotan login code";
  }

  return "Liotan verification code";
}

function getTitle(purpose) {
  if (privacy.genericEmailSubjects) {
    return "Security code";
  }

  if (purpose === "reset") {
    return "Password reset";
  }

  if (purpose === "login") {
    return "Login confirmation";
  }

  return "Email verification";
}

function createText(code, purpose) {
  return (
    `${getTitle(purpose)}\n\n` +
    `Code: ${code}\n\n` +
    "This code expires in 10 minutes.\n\n" +
    "If you did not request this code, ignore this email."
  );
}

function createPrivacyHeaders() {
  return {
    "X-Liotan-Mail": "security-code",
    "X-Auto-Response-Suppress": "All",
    "Auto-Submitted": "auto-generated"
  };
}

function createHtml(code, purpose) {
  const safeCode =
    String(code).replace(/[^0-9]/g, "");

  const title =
    getTitle(purpose);

  const hint = privacy.genericEmailSubjects
    ? "Use this code to continue in Liotan."
    : "Use this code to continue in Liotan.";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;padding:0;background:#0e1621;font-family:Arial,Helvetica,sans-serif;color:#ffffff">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e1621;padding:32px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:420px;background:#17212b;border-radius:18px;overflow:hidden;border:1px solid #243447">
                <tr>
                  <td style="padding:28px 28px 10px;text-align:center">
                    <div style="width:58px;height:58px;border-radius:50%;background:#3390ec;margin:0 auto 18px;line-height:58px;font-size:28px;font-weight:800;color:#ffffff">L</div>
                    <h1 style="margin:0;font-size:24px;line-height:1.2;color:#ffffff">${title}</h1>
                    <p style="margin:10px 0 0;color:#9aaabc;font-size:14px;line-height:1.5">${hint}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px;text-align:center">
                    <div style="display:inline-block;background:#0f1a25;border:1px solid #2b5278;border-radius:14px;padding:16px 22px;font-size:32px;font-weight:800;letter-spacing:8px;color:#ffffff">${safeCode}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;text-align:center;color:#8da2b5;font-size:13px;line-height:1.5">
                    The code expires in 10 minutes.<br />
                    If you did not request this code, ignore this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendViaResend({
  to,
  subject,
  text,
  html
}) {
  const response =
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getResendApiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: getMailFrom(),
        to,
        subject,
        text,
        html,
        headers: createPrivacyHeaders(),
        reply_to:
          getEnv("MAIL_REPLY_TO") || undefined
      })
    });

  if (!response.ok) {
    const body =
      await response.text().catch(() => "");

    const safeBody =
      body.slice(0, 500);

    throw new Error(
      `Resend email failed: ${response.status}${safeBody ? ` ${safeBody}` : ""}`
    );
  }

  return {
    sent: true,
    provider: "resend"
  };
}

async function sendViaSmtp({
  to,
  subject,
  text,
  html
}) {
  if (!hasSmtpConfig()) {
    return null;
  }

  const nodemailer =
    require("nodemailer");

  const transporter =
    nodemailer.createTransport({
      host: getEnv("SMTP_HOST"),
      port: Number(getEnv("SMTP_PORT") || 587),
      secure: String(getEnv("SMTP_SECURE") || "false") === "true",
      auth: {
        user: getEnv("SMTP_USER"),
        pass: getEnv("SMTP_PASS")
      }
    });

  await transporter.sendMail({
    from: getMailFrom(),
    to,
    subject,
    text,
    html,
    headers: createPrivacyHeaders(),
    replyTo:
      getEnv("MAIL_REPLY_TO") || undefined
  });

  return {
    sent: true,
    provider: "smtp"
  };
}

async function sendEmailCode({
  to,
  code,
  purpose
}) {
  const subject =
    getSubject(purpose);

  const text =
    createText(code, purpose);

  const html =
    createHtml(code, purpose);

  if (hasResendConfig()) {
    try {
      return await sendViaResend({
        to,
        subject,
        text,
        html
      });
    } catch (err) {
      logger.error("Liotan mail provider rejected email", err);

      const smtpFallback =
        await sendViaSmtp({
          to,
          subject,
          text,
          html
        });

      if (smtpFallback) {
        return smtpFallback;
      }

      return {
        sent: false,
        provider: "resend",
        message: "Email delivery was rejected. Verify the Resend domain/sender on Liotan-api or configure SMTP fallback."
      };
    }
  }

  const smtpResult =
    await sendViaSmtp({
      to,
      subject,
      text,
      html
    });

  if (smtpResult) {
    return smtpResult;
  }

  if (process.env.NODE_ENV !== "production") {
    logger.warn(
      "Email provider is disabled in development; code generated",
      { purpose }
    );

    return {
      sent: false,
      provider: "console",
      message: "Email provider is not configured. Development code was printed to the server console."
    };
  }

  logger.error(
    "Liotan mail is disabled",
    new Error("RESEND_API_KEY missing")
  );

  return {
    sent: false,
    provider: "disabled",
    message: "Email service is not configured. Add RESEND_API_KEY to Liotan-api Environment and redeploy."
  };
}

async function sendSecurityEmail({
  to,
  subject,
  text,
  html
}) {
  if (hasResendConfig()) {
    try {
      return await sendViaResend({ to, subject, text, html });
    } catch (err) {
      logger.error("Liotan security mail provider rejected email", err);

      const smtpFallback =
        await sendViaSmtp({ to, subject, text, html });

      if (smtpFallback) {
        return smtpFallback;
      }

      return {
        sent: false,
        provider: "resend",
        message: "security email rejected"
      };
    }
  }

  const smtpResult = await sendViaSmtp({ to, subject, text, html });
  if (smtpResult) {
    return smtpResult;
  }

  if (process.env.NODE_ENV !== "production") {
    logger.warn("Security email provider is disabled in development", { subject });
    return { sent: false, provider: "console" };
  }

  logger.error("Liotan security mail is disabled", new Error("mail provider missing"));
  return { sent: false, provider: "disabled" };
}

async function sendEmailChangeCancelNotice({ to, cancelUrl, applyAfter }) {
  const subject = privacy.genericEmailSubjects ? "Liotan security notice" : "Liotan email change pending";
  const text = [
    "A Liotan account email change was requested.",
    "",
    `The change will become active after: ${new Date(applyAfter).toISOString()}`,
    "",
    "If this was not you, cancel the change here:",
    cancelUrl,
    "",
    "Liotan support cannot manually restore account access. This link is the protected cancellation flow."
  ].join("\n");
  const safeUrl = String(cancelUrl || "").replace(/"/g, "&quot;");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0e1621;color:#fff;padding:24px"><div style="max-width:520px;margin:auto;background:#17212b;border:1px solid #243447;border-radius:16px;padding:24px"><h2>Liotan security notice</h2><p>An account email change was requested.</p><p>The change will become active after:<br><b>${new Date(applyAfter).toISOString()}</b></p><p>If this was not you, cancel the change:</p><p><a style="color:#8bc7ff" href="${safeUrl}">${safeUrl}</a></p><p style="color:#9aaabc;font-size:13px">Liotan support cannot manually restore account access. This link is the protected cancellation flow.</p></div></body></html>`;
  return sendSecurityEmail({ to, subject, text, html });
}


async function sendRegistrationNotice({ to, username, cancelUrl, expiresAt }) {
  const subject = privacy.genericEmailSubjects ? "Liotan security notice" : "Liotan account registered";
  const text = [
    "A Liotan account was registered with this email address.",
    "",
    `Username: ${username}`,
    "",
    "If this was you, no action is required.",
    "If this was not you, cancel this registration here:",
    cancelUrl,
    "",
    `This cancellation link expires at: ${new Date(expiresAt).toISOString()}`,
    "",
    "Liotan support cannot manually prove ownership or restore access. This link is the protected cancellation flow."
  ].join("\n");

  const safeUrl = String(cancelUrl || "").replace(/"/g, "&quot;");
  const safeUsername = String(username || "").replace(/[<>&"]/g, "");
  const safeExpiresAt = new Date(expiresAt).toISOString();
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0e1621;color:#fff;padding:24px"><div style="max-width:520px;margin:auto;background:#17212b;border:1px solid #243447;border-radius:16px;padding:24px"><h2>Liotan security notice</h2><p>A Liotan account was registered with this email address.</p><p><b>Username:</b> ${safeUsername}</p><p>If this was you, no action is required.</p><p>If this was not you, cancel this registration:</p><p><a style="color:#8bc7ff" href="${safeUrl}">${safeUrl}</a></p><p style="color:#9aaabc;font-size:13px">This cancellation link expires at ${safeExpiresAt}. Liotan support cannot manually prove ownership or restore access.</p></div></body></html>`;
  return sendSecurityEmail({ to, subject, text, html });
}

async function sendLoginNotice({ to, username, at }) {
  const subject = privacy.genericEmailSubjects ? "Liotan security notice" : "Liotan login notice";
  const safeUsername = String(username || "").replace(/[<>&"]/g, "");
  const safeAt = new Date(at || Date.now()).toISOString();

  const text = [
    "A successful login to Liotan was completed.",
    "",
    `Username: ${username}`,
    `Time: ${safeAt}`,
    "",
    "If this was you, no action is required.",
    "If this was not you, change your password, revoke other sessions, and enable 2FA."
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0e1621;color:#fff;padding:24px"><div style="max-width:520px;margin:auto;background:#17212b;border:1px solid #243447;border-radius:16px;padding:24px"><h2>Liotan security notice</h2><p>A successful login to Liotan was completed.</p><p><b>Username:</b> ${safeUsername}</p><p><b>Time:</b> ${safeAt}</p><p>If this was you, no action is required.</p><p style="color:#ffb4b4">If this was not you, change your password, revoke other sessions, and enable 2FA.</p></div></body></html>`;

  return sendSecurityEmail({ to, subject, text, html });
}

function getMailStatus() {
  const withFrom = (status) => privacy.minimalLogs
    ? status
    : {
        ...status,
        from: getMailFrom()
      };

  if (hasResendConfig()) {
    return withFrom({
      provider: "resend",
      configured: true
    });
  }

  if (hasSmtpConfig()) {
    return withFrom({
      provider: "smtp",
      configured: true
    });
  }

  return withFrom({
    provider: "none",
    configured: false
  });
}

module.exports = {
  sendEmailCode,
  sendSecurityEmail,
  sendEmailChangeCancelNotice,
  sendRegistrationNotice,
  sendLoginNotice,
  hasMailConfig,
  hasSmtpConfig,
  hasResendConfig,
  getMailStatus
};
