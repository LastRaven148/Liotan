const {
  getSessionRestrictionState
} = require("../utils/sessionSecurity");

const RESTRICTED_MESSAGE_RU = "Доступ запрещен на 72 часа в целях безопасности.";
const RESTRICTED_MESSAGE_EN = "Access is blocked for 72 hours for security reasons.";

function wantsRussian(req) {
  const language = String(req.headers["accept-language"] || "").toLowerCase();
  return language.startsWith("ru") || language.includes(",ru");
}

function getRestrictedMessage(req) {
  return wantsRussian(req) ? RESTRICTED_MESSAGE_RU : RESTRICTED_MESSAGE_EN;
}

async function restrictedSessionGuard(req, res, next) {
  try {
    const state = await getSessionRestrictionState({
      userId: req.user?.userId,
      username: req.user?.username,
      sessionId: req.user?.sid
    });

    if (!state.restricted) {
      return next();
    }

    return res.status(403).json({
      error: getRestrictedMessage(req),
      restricted: true,
      restrictedUntil: state.restrictedUntil,
      restrictedForHours: state.restrictedForHours
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  restrictedSessionGuard,
  getRestrictedMessage,
  RESTRICTED_MESSAGE_RU,
  RESTRICTED_MESSAGE_EN
};
