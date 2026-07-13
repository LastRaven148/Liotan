const bcrypt = require("bcrypt");
const { signAuthToken } = require("../utils/authToken");
const { setAuthCookie } = require("../utils/authCookie");
const User = require("../models/User");
const RegistrationCancel = require("../models/RegistrationCancel");
const {
  normalizeEmail,
  hashEmail
} = require("../utils/privacy");
const {
  createUserSession,
  hashSessionId,
  revokeAllUserSessions
} = require("../utils/sessionSecurity");
const {
  sendEmailCode,
  sendRegistrationNotice,
  sendLoginNotice
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
const { encryptJson, randomToken, sha256 } = require("../security/crypto/secureEnvelope");
const privacy = require("../config/privacy");
const {
  applyEligiblePendingEmailChanges,
} = require("../security/emailChange/emailChangeSecurity");
const {
  authLookupError,
  consumeEmailCode,
  createCode,
  emailCodeResponse,
  maskEmail,
  saveEmailCode,
  verifyEmailCode
} = require("./auth/emailCodeService");
const { verifySecondFactorIfEnabled } = require("./auth/secondFactorService");


const normalizeBaseUrl = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
};

function getRegistrationCancelUrl(token) {
  const publicSecurityUrl = normalizeBaseUrl(
    process.env.PUBLIC_SECURITY_URL ||
    "https://security.liotan.com"
  );

  return `${publicSecurityUrl}/auth/register/cancel/${encodeURIComponent(token)}`;
}

const {
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
} = require("./auth/securityPages");

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
    const ok = await verifyEmailCode({ emailHash, purpose, code, consume: false });
    if (!ok) {
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
module.exports = {
  getRegistrationCancelUrl,
  sendAuthCode,
  verifyAuthCode,
  sendLoginCode,
  register,
  login,
  resetPassword,
  ...require("./auth/sessionController"),
  ...require("./auth/emailChangeController"),
  ...require("./auth/registrationSecurityController")
};
