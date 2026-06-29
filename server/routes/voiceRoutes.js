const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const realtimeFeatures = require("../config/realtimeFeatures");
const { apiLimiter } = require("../middleware/rateLimiters");
const { VOICE_POLICY, noStoreHeaders } = require("../utils/realtimeSecurityPolicy");

const router = express.Router();

router.get(
  "/voice/capabilities",
  authMiddleware,
  apiLimiter,
  noStoreHeaders,
  (req, res) => {
    res.json({
      ok: true,
      feature: "voiceMessages",
      ...realtimeFeatures.voiceMessages,
      policy: VOICE_POLICY
    });
  }
);

module.exports = router;
