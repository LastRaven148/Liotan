let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (err) {
  nodemailer = null;
}

function hasResendConfig() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.MAIL_FROM
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

function createTransporter() {
  if (!nodemailer || !hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
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

function createText(code) {
  return (
    `Your Liotan code: ${code}\n\n` +
    "The code expires in 10 minutes.\n\n" +
    "If you did not request this code, ignore this email."
  );
}

function createHtml(code) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 12px">Liotan verification code</h2>
      <p style="margin:0 0 16px">Use this code to continue:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0">
        ${String(code).replace(/[^0-9]/g, "")}
      </div>
      <p style="margin:0;color:#6b7280">The code expires in 10 minutes.</p>
      <p style="margin:12px 0 0;color:#6b7280">If you did not request this code, ignore this email.</p>
    </div>
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
        from: process.env.MAIL_FROM,
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
  const transporter =
    createTransporter();

  if (!transporter) {
    return null;
  }

  await transporter.sendMail({
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_USER,
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
    createText(code);

  const html =
    createHtml(code);

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
