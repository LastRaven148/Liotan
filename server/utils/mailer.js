let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (err) {
  nodemailer = null;
}

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
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

async function sendEmailCode({
  to,
  code,
  purpose
}) {
  const transporter =
    createTransporter();

  const subject =
    purpose === "reset"
      ? "Liotan password reset code"
      : "Liotan verification code";

  const text =
    `Your Liotan code: ${code}\n\n` +
    "The code expires in 10 minutes.";

  if (!transporter) {
    console.log(
      `[Liotan email code] ${purpose} ${to}: ${code}`
    );

    return {
      sent: false
    };
  }

  await transporter.sendMail({
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_USER,
    to,
    subject,
    text
  });

  return {
    sent: true
  };
}

module.exports = {
  sendEmailCode,
  hasSmtpConfig
};
