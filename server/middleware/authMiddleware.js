const jwt =
  require("jsonwebtoken");

const User =
  require("../models/User");

const {
  isSessionActive,
  touchSession
} = require("../utils/sessionSecurity");

async function authMiddleware(
  req,
  res,
  next
) {
  try {
    const header =
      req.headers.authorization;

    if (
      !header ||
      !header.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error: "auth required"
      });
    }

    const token =
      header.slice("Bearer ".length).trim();

    if (
      !token ||
      token.length > 4096
    ) {
      return res.status(401).json({
        error: "invalid token"
      });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          algorithms: ["HS256"]
        }
      );

    if (
      !decoded.userId ||
      !decoded.username ||
      !decoded.sid
    ) {
      return res.status(401).json({
        error: "invalid token"
      });
    }

    const user =
      await User.findOne({
        _id: decoded.userId,
        username: decoded.username
      }, "username emailVerified").lean();

    if (!user) {
      return res.status(401).json({
        error: "account deleted"
      });
    }

    if (user.emailVerified !== true) {
      return res.status(401).json({
        error: "email verification required"
      });
    }

    const sessionOk =
      await isSessionActive({
        userId: decoded.userId,
        username: decoded.username,
        sessionId: decoded.sid
      });

    if (!sessionOk) {
      return res.status(401).json({
        error: "session expired"
      });
    }

    await touchSession(decoded.sid);

    req.user =
      decoded;

    next();
  } catch (err) {
    res.status(401).json({
      error: "auth error"
    });
  }
}

module.exports =
  authMiddleware;
