const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

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
  signAttachmentUpload
);

router.post(
  "/attachments/upload",
  authMiddleware,
  attachmentUpload.single("attachment"),
  uploadAttachment
);

module.exports =
  router;