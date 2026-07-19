const User =
  require("../models/User");

const {
  isSessionActive,
  touchSession
} = require("../utils/sessionSecurity");

const {
  getAuthTokenFromRequest,
  verifyAuthToken
} = require("../utils/authToken");

async function authMiddleware(
  req,
  res,
  next
) {
  try {
    const token =
      getAuthTokenFromRequest(req);

    const decoded =
      verifyAuthToken(token);

    if (!decoded) {
      return res.status(401).json({
        error: "auth required"
      });
    }

    const user =
      await User.findOne({
        _id: decoded.userId,
        username: decoded.username,
        emailVerified: true
      }, "username lifecycleState deletionWorkflowId").lean();

    if (!user) {
      return res.status(401).json({
        error: "auth required"
      });
    }

    const deletionEndpoint =
      (req.method === "DELETE" && req.path === "/me/account") ||
      (req.method === "GET" && req.path.startsWith("/me/account/deletion/"));
    if (user.lifecycleState === "deleting" && !deletionEndpoint) {
      return res.status(423).json({
        error: "account deletion in progress",
        workflowId: user.deletionWorkflowId || ""
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
        error: "auth required"
      });
    }

    await touchSession(decoded.sid);

    req.user =
      decoded;

    req.token =
      token;

    next();
  } catch (err) {
    res.status(401).json({
      error: "auth required"
    });
  }
}

module.exports =
  authMiddleware;
