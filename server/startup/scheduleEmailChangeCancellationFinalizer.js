"use strict";

const {
  runEmailChangeCancellationFinalizer
} = require("../security/emailChange/emailChangeSecurity");

function scheduleEmailChangeCancellationFinalizer(logger) {
  const intervalMs = Math.max(
    5_000,
    Math.min(
      Number(process.env.EMAIL_CHANGE_CANCELLATION_INTERVAL_MS) || 15_000,
      5 * 60_000
    )
  );
  const batchSize = Math.max(
    1,
    Math.min(Number(process.env.EMAIL_CHANGE_CANCELLATION_BATCH_SIZE) || 20, 100)
  );
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runEmailChangeCancellationFinalizer({ batchSize });
      if (result.claimed || result.failed) {
        logger.info("email-change cancellation finalizer completed", result);
      }
    } catch (error) {
      logger.warn("email-change cancellation finalizer cycle failed", {
        code: String(error?.code || error?.name || "EMAIL_CHANGE_CANCELLATION_FAILED")
      });
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(run, Math.min(intervalMs, 5_000));
  initial.unref?.();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { initial, timer, run };
}

module.exports = scheduleEmailChangeCancellationFinalizer;
