"use strict";

const cleanupUploads = require("../scripts/cleanupUploadsTask");
const { isR2Configured } = require("../utils/uploadToR2");

function scheduleAttachmentCleanup(logger) {
  if (!isR2Configured()) return null;
  const intervalMs = Math.max(
    60_000,
    Number(process.env.ATTACHMENT_CLEANUP_INTERVAL_MS) || 15 * 60_000
  );
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const deleted = await cleanupUploads.cleanupR2OrphanUploads();
      if (deleted) logger.info("MLS attachment cleanup completed", { deleted });
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
