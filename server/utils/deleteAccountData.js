"use strict";

// Compatibility adapter for explicit administrative cleanup and security-link
// callers. The durable workflow is the sole account-deletion implementation.
const crypto = require("node:crypto");
const User = require("../models/User");
const {
  requestAccountDeletion,
  runDeletionWorkflow,
  workflowView
} = require("../services/deletionWorkflow");

function cleanupIdempotencyKey(user) {
  const hash = crypto.createHash("sha256")
    .update(`account-cleanup:${user._id}:${user.username}`, "utf8")
    .digest("base64url");
  return `account-cleanup-${hash}`;
}

async function deleteAccountData(username, { io = null } = {}) {
  const user = await User.findOne({ username }, "_id username").lean();
  if (!user) return { ok: false, pending: false, state: "not-found" };
  const workflow = await requestAccountDeletion({
    userId: user._id,
    username: user.username,
    idempotencyKey: cleanupIdempotencyKey(user)
  });
  const result = await runDeletionWorkflow({ workflowId: workflow.workflowId, io });
  const view = result || workflowView(workflow);
  return {
    ok: view.state === "completed",
    pending: view.state !== "completed" && !view.terminal,
    workflowId: view.workflowId,
    state: view.state
  };
}

module.exports = deleteAccountData;
