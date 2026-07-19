"use strict";

const { runDeletionWorkflow } = require("../services/deletionWorkflow");

function scheduleDeletionWorkflows(logger, io) {
  const intervalMs = Math.max(
    5_000,
    Number(process.env.DELETION_WORKFLOW_INTERVAL_MS) || 15_000
  );
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runDeletionWorkflow({ io });
      if (result) logger.info("deletion workflow advanced", {
        workflowId: result.workflowId,
        type: result.type,
        state: result.state
      });
    } catch (error) {
      logger.warn("deletion workflow cycle failed", {
        code: String(error?.code || error?.name || "DELETION_WORKFLOW_FAILED")
      });
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(run, Math.min(intervalMs, 5_000));
  initial.unref?.();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { initial, timer };
}

module.exports = scheduleDeletionWorkflows;
