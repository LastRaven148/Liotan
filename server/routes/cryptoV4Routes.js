"use strict";

const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const cryptoDeviceAuth = require("../middleware/cryptoDeviceAuth");
const {
  e2eeLimiter,
  mediaDownloadLimiter
} = require("../middleware/rateLimiters");
const controller = require("../controllers/cryptoV4Controller");
const attachmentUpload = require("../config/attachmentUpload");
const {
  authorizeMediaUpload,
  reserveMediaUpload
} = require("../middleware/mediaAuthorization");

const router = express.Router();
router.use("/crypto/v4", authMiddleware, e2eeLimiter);

router.get("/crypto/v4/bootstrap", controller.bootstrap);
router.post("/crypto/v4/identity", controller.pinIdentity);
router.post("/crypto/v4/devices", controller.registerDevice);
router.post(
  "/crypto/v4/devices/:deviceId/auth-migration",
  cryptoDeviceAuth,
  controller.migrateDeviceAuthentication
);
router.post("/crypto/v4/devices/:deviceId/recovery-bootstrap", controller.confirmRecoveryBootstrap);
router.post("/crypto/v4/devices/:deviceId/recovery-enrollment", controller.confirmRecoveryEnrollment);
router.get("/crypto/v4/devices", cryptoDeviceAuth, controller.listDevices);
router.post("/crypto/v4/devices/:deviceId/approve", cryptoDeviceAuth, controller.approveDevice);
router.post("/crypto/v4/devices/:deviceId/revoke", cryptoDeviceAuth, controller.revokeDevice);
router.post("/crypto/v4/devices/:deviceId/renew", cryptoDeviceAuth, controller.renewDevice);
router.post("/crypto/v4/key-packages", cryptoDeviceAuth, controller.publishKeyPackages);
router.get("/crypto/v4/key-packages/status", cryptoDeviceAuth, controller.keyPackageStatus);
router.get("/crypto/v4/transparency/checkpoint", cryptoDeviceAuth, controller.getTransparencyCheckpoint);
router.get("/crypto/v4/transparency/consistency", cryptoDeviceAuth, controller.getTransparencyConsistency);
router.post("/crypto/v4/conversations/resolve", cryptoDeviceAuth, controller.resolveConversation);
router.post("/crypto/v4/conversations/:conversationId/operations", cryptoDeviceAuth, controller.beginOperation);
router.post("/crypto/v4/conversations/:conversationId/operations/:operationId/commit", cryptoDeviceAuth, controller.commitOperation);
router.post("/crypto/v4/conversations/:conversationId/messages", cryptoDeviceAuth, controller.sendCiphertext);
router.get("/crypto/v4/conversations/:conversationId/events", cryptoDeviceAuth, controller.getEvents);
router.post("/crypto/v4/conversations/:conversationId/deletion", cryptoDeviceAuth, controller.deleteConversation);
router.get("/crypto/v4/deletions/:workflowId", cryptoDeviceAuth, controller.getDeletionStatus);
router.post(
  "/crypto/v4/conversations/:conversationId/messages/:clientMessageId/hide",
  cryptoDeviceAuth,
  controller.hideMessage
);
router.get("/crypto/v4/invalidations", cryptoDeviceAuth, controller.listInvalidations);
router.post("/crypto/v4/invalidations/:eventId/ack", cryptoDeviceAuth, controller.acknowledgeInvalidation);
router.post(
  "/crypto/v4/media/upload",
  cryptoDeviceAuth,
  authorizeMediaUpload,
  reserveMediaUpload,
  attachmentUpload.single("attachment"),
  controller.uploadMedia
);
router.get(
  "/crypto/v4/media/:uploadId",
  cryptoDeviceAuth,
  mediaDownloadLimiter,
  controller.downloadMedia
);

module.exports = router;
