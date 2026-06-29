const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const realtimeFeatures = require("../config/realtimeFeatures");
const { apiLimiter } = require("../middleware/rateLimiters");

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

module.exports = router;
