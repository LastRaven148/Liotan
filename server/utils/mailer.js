function getMailFrom() {
  return (
    process.env.MAIL_FROM ||
    "Liotan <onboarding@resend.dev>"
  );
}

function hasResendConfig() {
  return Boolean(
    process.env.RESEND_API_KEY
  );
}

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function hasMailConfig() {
  return hasResendConfig() || hasSmtpConfig();
}

function getSubject(purpose) {
  if (purpose === "reset") {
    return "Liotan password reset code";
  }

  if (purpose === "login") {
    return "Liotan login code";
  }

  return "Liotan verification code";
}

function getTitle(purpose) {
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
    `Your Liotan code: ${code}\n\n` +
    "The code expires in 10 minutes.\n\n" +
    "If you did not request this code, ignore this email."
  );
}

function createHtml(code, purpose) {
  const safeCode =
    String(code).replace(/[^0-9]/g, "");

  const title =
    getTitle(purpose);

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
                    <p style="margin:10px 0 0;color:#9aaabc;font-size:14px;line-height:1.5">Use this code to continue in Liotan.</p>
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
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: getMailFrom(),
        to,
        subject,
        text,
        html,
        reply_to:
          process.env.MAIL_REPLY_TO || undefined
      })
    });

  if (!response.ok) {
    const body =
      await response.text().catch(() => "");

    throw new Error(
      `Resend email failed: ${response.status} ${body}`
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
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

  await transporter.sendMail({
    from: getMailFrom(),
    to,
    subject,
    text,
    html,
    replyTo:
      process.env.MAIL_REPLY_TO || undefined
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
    return sendViaResend({
      to,
      subject,
      text,
      html
    });
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
    console.log(
      `[Liotan email code] ${purpose} ${to}: ${code}`
    );
  }

  return {
    sent: false,
    provider:
      process.env.NODE_ENV === "production"
        ? "disabled"
        : "console"
  };
}

module.exports = {
  sendEmailCode,
  hasMailConfig,
  hasSmtpConfig,
  hasResendConfig
};
