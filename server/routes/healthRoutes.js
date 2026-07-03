const express = require("express");
const mongoose = require("mongoose");
const { version } = require("../config/version");

const router = express.Router();


router.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "liotan-api",
    version,
    requestId: req.id
  });
});

router.head("/", (req, res) => {
  res.status(204).end();
});

router.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

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
