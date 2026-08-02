const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  uploadLimiter,
  mediaDownloadLimiter
} = require("../middleware/rateLimiters");

const router =
  express.Router();

function legacyMediaGone(_req, res) {
  return res.status(410).json({
    error: "legacy media retired; signed MLS media required",
    endpoint: "/crypto/v4/media/upload",
    protocol: "mls-1.0"
  });
}

router.post(
  "/attachments/sign",
  authMiddleware,
  uploadLimiter,
  legacyMediaGone
);

router.post(
  "/attachments/upload",
  authMiddleware,
  uploadLimiter,
  legacyMediaGone
);

router.get(
  "/attachments/:uploadId/download",
  authMiddleware,
  mediaDownloadLimiter,
  legacyMediaGone
);

module.exports =
  router;
