const bcrypt = require("bcrypt");
const RegistrationCancel = require("../../models/RegistrationCancel");
const Session = require("../../models/Session");
const User = require("../../models/User");
const UserSecurity = require("../../models/UserSecurity");
const { decryptJson, sha256 } = require("../../security/crypto/secureEnvelope");
const deleteAccountData = require("../../utils/deleteAccountData");
const { sendAccountDeletedNotice, sendEmailCode } = require("../../utils/mailer");
const { isSessionHashRestricted, revokeAllUserSessions } = require("../../utils/sessionSecurity");
const { isValidEmailCode, isValidPassword } = require("../../utils/validators");
const { getRestrictedMessage } = require("../../middleware/restrictedSession");
const { createCode, saveEmailCode, verifyEmailCode } = require("./emailCodeService");
const {
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
} = require("./securityPages");

async function findRegistrationSecurityRecord(token) {
  const safeToken = normalizeRegistrationToken(token);
  if (!safeToken) {
    return null;
  }

  const tokenHash = sha256(safeToken);
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
    const token = normalizeRegistrationToken(req.params.token);
    const record = await findRegistrationSecurityRecord(token);

    if (!record) {
      return sendSimpleSecurityPage(res, {
        ok: false,
        title: "Ссылка недействительна",
        message: "Эта ссылка безопасности уже использована или истекла."
      });
    }

    return sendRegistrationSecurityPage(res, {
      token,
      record,
      req
    });
  } catch (err) {
    next(err);
  }
}


const REGISTRATION_SECURITY_ACTIONS = new Set([
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
  return REGISTRATION_SECURITY_ACTIONS.has(action);
}

function isSecurityPageActionBlockedByRestrictedSession(action) {
  return !["", "suspicious", "revoke-session", "logout-all"].includes(action);
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
    const token = normalizeRegistrationToken(req.params.token);
    const action = normalizeRegistrationSecurityAction(req.params.action);
    const record = await findRegistrationSecurityRecord(token);
    const locale = getSecurityPageLocale(req);
    const copy = securityText(locale);

    if (!action) {
      return sendSimpleSecurityPage(res, {
        ok: false,
        title: locale === "ru" ? "Неизвестное действие" : "Unknown action",
        message: locale === "ru" ? "Выбранное действие не поддерживается." : "The selected action is not supported."
      });
    }

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
      return sendSuspiciousRegistrationPage(res, { token: token, record, req });
    }

    if (action === "revoke-session") {
      if (!isConfirmedSecurityAction(req)) {
        return sendSecurityConfirmPage(res, { token: token, action, title: copy.revokeSession, text: copy.revokeSessionConfirm, req });
      }
      const result = record.sessionIdHash
        ? await Session.updateOne(
            { userId: record.userId, sessionIdHash: record.sessionIdHash, revokedAt: null },
            { $set: { revokedAt: new Date() } }
          )
        : { modifiedCount: 0 };
      if (record.sessionIdHash) {
        require("../../sockets/sessionRegistry").disconnectSessionHash(record.sessionIdHash);
      }
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
        return sendSecurityConfirmPage(res, { token: token, action, title: copy.logoutAll, text: copy.logoutAllConfirm, req });
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
        return sendSecurityConfirmPage(res, { token: token, action, title: copy.changePassword, text: copy.changePasswordConfirm, req });
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
      return sendChangePasswordPage(res, { token: token, req });
    }

    if (action === "change-password-submit") {
      const emailCode = String(req.body?.code || "").trim();
      const password = String(req.body?.password || "");
      const passwordConfirm = String(req.body?.passwordConfirm || "");
      if (!isValidEmailCode(emailCode)) {
        return sendChangePasswordPage(res, { token: token, req, error: locale === "ru" ? "Введите 8-значный код из письма." : "Enter the 8-digit email code." });
      }
      if (!isValidPassword(password) || password !== passwordConfirm) {
        return sendChangePasswordPage(res, { token: token, req, error: locale === "ru" ? "Пароль должен быть от 8 до 64 символов, оба поля должны совпадать." : "Password must be 8–64 characters, and both fields must match." });
      }
      const verified = await verifyEmailCode({
        emailHash: record.emailHash,
        purpose: "reset",
        code: emailCode
      });
      if (!verified) {
        return sendChangePasswordPage(res, { token: token, req, error: locale === "ru" ? "Код неверный или истёк." : "The code is invalid or expired." });
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
        return sendSecurityConfirmPage(res, { token: token, action, title: copy.reset2fa, text: copy.reset2faConfirm, req });
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
      return sendDeleteStepOnePage(res, { token: token, req });
    }

    if (action === "delete-step-2") {
      return sendDeleteStepTwoPage(res, { token: token, req });
    }

    if (action === "delete-final") {
      if (!isConfirmedSecurityAction(req)) {
        return sendDeleteStepTwoPage(res, { token: token, req });
      }
      const email = getRecordEmail(record);
      const result = await deleteAccountData(record.username);

      // Successful account deletion removes every security record itself. If
      // storage deletion fails, keep this one-time link unconsumed so the user
      // can safely retry instead of stranding R2 objects behind a dead token.
      if (!result.ok && !result.pending) {
        await markRegistrationActionUsed(record, "delete-final-not-found");
      }

      if (email && result.ok) {
        await sendAccountDeletedNotice({
          to: email,
          username: record.username,
          at: new Date()
        }).catch(() => null);
      }

      return sendSimpleSecurityPage(res, {
        ok: result.ok || result.pending,
        title: result.ok
          ? (locale === "ru" ? "Аккаунт удалён" : "Account deleted")
          : result.pending
            ? (locale === "ru" ? "Удаление выполняется" : "Deletion in progress")
            : (locale === "ru" ? "Не удалось удалить аккаунт" : "Could not delete account"),
        message: result.ok
          ? (locale === "ru" ? "Аккаунт Liotan и связанные данные были удалены." : "The Liotan account and related data were deleted.")
          : result.pending
            ? (locale === "ru" ? "Аккаунт заблокирован, а безопасное удаление данных будет автоматически продолжено." : "The account is locked and durable data deletion will continue automatically.")
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

module.exports = { cancelRegistration, handleRegistrationSecurityAction };
