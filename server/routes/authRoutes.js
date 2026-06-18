const express =
  require("express");

const {
  authLimiter
} = require("../middleware/rateLimiters");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  register,
  login,
  deleteMe
} = require("../controllers/authController");

const router =
  express.Router();

router.post(
  "/register",
  authLimiter,
  register
);

router.post(
  "/login",
  authLimiter,
  login
);

router.delete(
  "/me",
  authMiddleware,
  deleteMe
);

module.exports = router;