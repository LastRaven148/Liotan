const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  uploadLimiter,
  mediaDownloadLimiter
} = require("../middleware/rateLimiters");

const attachmentUpload =
  require("../config/attachmentUpload");

const {
  uploadAttachment,
  downloadAttachment,
  signAttachmentUpload
} = require("../controllers/attachmentController");

const router =
  express.Router();

router.post(
  "/attachments/sign",
  authMiddleware,
  uploadLimiter,
  signAttachmentUpload
);

router.post(
  "/attachments/upload",
  authMiddleware,
  uploadLimiter,
  (_req, res) => res.status(410).json({
    error: "legacy media upload disabled; signed MLS media upload required",
    endpoint: "/crypto/v4/media/upload"
  })
);

router.get(
  "/attachments/:uploadId/download",
  authMiddleware,
  mediaDownloadLimiter,
  downloadAttachment
);

module.exports =
  router;
