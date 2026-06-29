const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const realtimeFeatures = require("../config/realtimeFeatures");
const { apiLimiter } = require("../middleware/rateLimiters");
const User = require("../models/User");
const { isValidUsername } = require("../utils/validators");
const { getCallRouteId } = require("../utils/callPrivacy");

const router = express.Router();

router.get(
  "/calls/capabilities",
  authMiddleware,
  apiLimiter,
  (req, res) => {
    res.json({
      ok: true,
      feature: "calls",
      ...realtimeFeatures.calls
    });
  }
);

router.post(
  "/calls/route",
  authMiddleware,
  apiLimiter,
  async (req, res, next) => {
    try {
      const username =
        String(req.body?.username || "")
          .trim();

      if (!isValidUsername(username)) {
        return res.status(400).json({
          ok: false,
          message: "invalid user"
        });
      }

      const exists =
        await User.exists({
          username,
          emailVerified: true
        });

      if (!exists) {
        return res.status(404).json({
          ok: false,
          message: "user not found"
        });
      }

      res.json({
        ok: true,
        routeId: getCallRouteId(username),
        privacy: {
          persistentCallLogs: false,
          targetStored: false,
          serverCanReadMedia: false
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
