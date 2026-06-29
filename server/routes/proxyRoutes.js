const express = require("express");
const realtimeFeatures = require("../config/realtimeFeatures");

const router = express.Router();

router.get("/proxy/capabilities", (req, res) => {
  res.json({
    ok: true,
    feature: "proxyTransport",
    ...realtimeFeatures.proxyTransport
  });
});

module.exports = router;
