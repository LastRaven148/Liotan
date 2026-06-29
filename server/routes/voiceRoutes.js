const express = require("express");
const realtimeFeatures = require("../config/realtimeFeatures");

const router = express.Router();

router.get("/voice/capabilities", (req, res) => {
  res.json({
    ok: true,
    feature: "voiceMessages",
    ...realtimeFeatures.voiceMessages
  });
});

module.exports = router;
