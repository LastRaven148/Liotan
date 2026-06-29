const jwt =
  require("jsonwebtoken");

const User =
  require("../models/User");

async function authMiddleware(
  req,
  res,
  next
) {

  try {

    const header =
      req.headers.authorization;

    if (!header) {
      return res.status(401).json({
        error: "no token"
      });
    }

    const token =
      header.replace(
        "Bearer ",
        ""
      );

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    if (
      !decoded.userId ||
      !decoded.username
    ) {
      return res.status(401).json({
        error: "invalid token"
      });
    }

    const exists =
      await User.exists({
        _id: decoded.userId,
        username: decoded.username
      });

    if (!exists) {
      return res.status(401).json({
        error: "account deleted"
      });
    }

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
