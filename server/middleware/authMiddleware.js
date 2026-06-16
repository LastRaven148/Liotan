const jwt =
  require("jsonwebtoken");

function authMiddleware(
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