const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

function getMongoState() {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };

  return states[mongoose.connection.readyState] || "unknown";
}

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "Liotan",
    version: "46.0",
    uptimeSeconds: Math.round(process.uptime()),
    mongo: getMongoState(),
    requestId: req.id
  });
});

router.get("/health/ready", (req, res) => {
  const mongo = getMongoState();
  const ready = mongo === "connected";

  res.status(ready ? 200 : 503).json({
    ok: ready,
    app: "Liotan",
    version: "46.0",
    mongo,
    requestId: req.id
  });
});

module.exports = router;
