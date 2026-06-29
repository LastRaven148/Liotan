const express = require("express");
const realtimeFeatures = require("../config/realtimeFeatures");

const router = express.Router();

router.get("/calls/capabilities", (req, res) => {
  res.json({
    ok: true,
    feature: "calls",
    ...realtimeFeatures.calls
  });
});

module.exports = router;
