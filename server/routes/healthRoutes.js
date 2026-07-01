const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    requestId: req.id
  });
});

router.get("/health/ready", (req, res) => {
  const ready = isMongoReady();

  res.status(ready ? 200 : 503).json({
    ok: ready,
    requestId: req.id
  });
});

module.exports = router;
