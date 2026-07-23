const jwt = require("jsonwebtoken");

const MAX_TOKEN_LENGTH = Number(process.env.AUTH_MAX_TOKEN_LENGTH) || 4096;
const AUTH_TOKEN_EXPIRES_IN = process.env.AUTH_TOKEN_EXPIRES_IN || "7d";

function getBearerToken(header) {
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

function getAuthTokenFromRequest(req) {
  try {
    const { getAuthCookie } = require("./authCookie");
    return getAuthCookie(req);
  } catch {
    return "";
  }
}

function isSafeTokenString(token) {
  return Boolean(
    token &&
    typeof token === "string" &&
    token.length <= MAX_TOKEN_LENGTH &&
    /^[A-Za-z0-9._-]+$/.test(token)
  );
}

function sanitizeDecodedToken(decoded) {
  if (!decoded || typeof decoded !== "object") {
    return null;
  }

  const userId = String(decoded.userId || "");
  const username = String(decoded.username || "");
  const sid = String(decoded.sid || "");
  const iat = Number(decoded.iat);
  const exp = Number(decoded.exp);

  if (
    !/^[a-fA-F0-9]{24}$/.test(userId) ||
    !/^[a-zA-Z0-9_]{3,15}$/.test(username) ||
    sid.length < 32 ||
    sid.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(sid) ||
    !Number.isSafeInteger(iat) ||
    !Number.isSafeInteger(exp) ||
    exp <= iat
  ) {
    return null;
  }

  return {
    userId,
    username,
    sid,
    iat,
    exp
  };
}

function signAuthToken(user, sessionId) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      username: user.username,
      sid: sessionId
    },
    process.env.JWT_SECRET,
    {
      expiresIn: AUTH_TOKEN_EXPIRES_IN,
      algorithm: "HS256"
    }
  );
}

function verifyAuthToken(token) {
  if (!isSafeTokenString(token)) {
    return null;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"]
  });

  return sanitizeDecodedToken(decoded);
}

module.exports = {
  MAX_TOKEN_LENGTH,
  AUTH_TOKEN_EXPIRES_IN,
  getBearerToken,
  getAuthTokenFromRequest,
  isSafeTokenString,
  sanitizeDecodedToken,
  signAuthToken,
  verifyAuthToken
};
