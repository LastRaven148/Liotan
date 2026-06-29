const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  uploadLimiter
} = require("../middleware/rateLimiters");

const attachmentUpload =
  require("../config/attachmentUpload");

const {
  uploadAttachment,
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
  attachmentUpload.single("attachment"),
  uploadAttachment
);

module.exports =
  router;