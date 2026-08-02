"use strict";

const cleanupUploads = require("../scripts/cleanupUploadsTask");
const { isR2Configured } = require("../utils/uploadToR2");
const { releaseExpiredMediaTransfers } = require("../services/mediaQuota");
const { cleanupStaleUploadedAvatars, cleanupPendingAvatars } = require("../services/avatarLifecycle");

function scheduleAttachmentCleanup(logger) {
  const intervalMs = Math.max(
    60_000,
    Math.min(
      Number(process.env.ATTACHMENT_CLEANUP_INTERVAL_MS) || 5 * 60_000,
      5 * 60_000
    )
  );
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const released = await releaseExpiredMediaTransfers();
      const uploadedAvatars = isR2Configured() ? await cleanupStaleUploadedAvatars() : { activated: 0, deleted: 0 };
      const pendingAvatars = isR2Configured() ? await cleanupPendingAvatars() : 0;
      const deleted = isR2Configured() ? await cleanupUploads.cleanupR2OrphanUploads() : 0;
      if (deleted || released || uploadedAvatars.activated || uploadedAvatars.deleted || pendingAvatars) {
        logger.info("MLS attachment cleanup completed", {
          deleted,
          released,
          uploadedAvatars,
          pendingAvatars
        });
      }
    } catch (error) {
      logger.warn("MLS attachment cleanup cycle failed", { error: error.message });
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(run, Math.min(intervalMs, 60_000));
  initial.unref?.();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { initial, timer };
}

module.exports = scheduleAttachmentCleanup;
