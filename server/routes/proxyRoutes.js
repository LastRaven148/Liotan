const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const realtimeFeatures = require("../config/realtimeFeatures");
const { apiLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.get(
  "/proxy/capabilities",
  authMiddleware,
  apiLimiter,
  (req, res) => {
    res.json({
      ok: true,
      feature: "proxyTransport",
      ...realtimeFeatures.proxyTransport
    });
  }
);

module.exports = router;
