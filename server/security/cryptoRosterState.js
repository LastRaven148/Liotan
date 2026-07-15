"use strict";

const crypto = require("crypto");
const CryptoConversation = require("../models/CryptoConversation");
const CryptoOperation = require("../models/CryptoOperation");
const CryptoKeyPackage = require("../models/CryptoKeyPackage");
const { canonicalJson } = require("../utils/canonicalJson");

function normalizeClientIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || ""))
    .filter(Boolean))].sort();
}

function clientIdsHash(values) {
  return crypto.createHash("sha256")
    .update(canonicalJson(normalizeClientIds(values)), "utf8")
    .digest("base64url");
}

function authorizedClientIds(conversation) {
  const authorized = normalizeClientIds(conversation?.authorizedClientIds);
  if (authorized.length || !conversation?.initialized) return authorized;
  // Backward-compatible read for releases created before the policy roster
  // field existed. The migration persists this value before deployment.
  return normalizeClientIds(conversation?.activeClientIds);
}

function operationIntentHash(value) {
  return crypto.createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("base64url");
}

async function cancelPendingOperations(conversationIds, reason, { session = null } = {}) {
  const ids = [...new Set((conversationIds || []).map(String).filter(Boolean))];
  if (!ids.length) return 0;
  let find = CryptoOperation.find({ conversationId: { $in: ids }, status: "pending" }, "operationId");
  if (session) find = find.session(session);
  const pending = await find.lean();
  if (!pending.length) return 0;
  const operationIds = pending.map(item => item.operationId);
  await CryptoOperation.updateMany(
    { operationId: { $in: operationIds }, status: "pending" },
    { $set: { status: "cancelled", cancellationReason: String(reason || "roster changed") } },
    { session }
  );
  await CryptoKeyPackage.updateMany(
    { claimedBy: { $in: operationIds } },
    { $set: { claimedAt: null, claimedBy: "", conversationId: "" } },
    { session }
  );
  return operationIds.length;
}

async function transitionConversationRoster(selector, {
  addClientIds = [],
  removeClientIds = [],
  reason = "roster changed",
  forceVersion = true,
  session = null
} = {}) {
  const additions = normalizeClientIds(addClientIds);
  const removals = new Set(normalizeClientIds(removeClientIds));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let find = CryptoConversation.findOne(selector);
    if (session) find = find.session(session);
    const conversation = await find;
    if (!conversation) return null;
    const current = authorizedClientIds(conversation);
    const next = normalizeClientIds([...current, ...additions].filter(id => !removals.has(id)));
    const changed = clientIdsHash(current) !== clientIdsHash(next);
    if (!changed && !forceVersion) return conversation;
    const previousVersion = Number(conversation.rosterVersion) || 0;
    const versionPredicate = previousVersion === 0
      ? { $or: [{ rosterVersion: 0 }, { rosterVersion: { $exists: false } }] }
      : { rosterVersion: previousVersion };
    const update = await CryptoConversation.updateOne(
      { _id: conversation._id, ...versionPredicate },
      {
        $set: {
          authorizedClientIds: next,
          blockedForEpochChange: true
        },
        $inc: { rosterVersion: 1 }
      },
      { session }
    );
    if (update.modifiedCount === 1) {
      await cancelPendingOperations([conversation.conversationId], reason, { session });
      let refreshed = CryptoConversation.findById(conversation._id);
      if (session) refreshed = refreshed.session(session);
      return refreshed;
    }
  }
  const error = new Error("concurrent MLS roster transition");
  error.status = 409;
  throw error;
}

async function transitionUserConversations(userId, options = {}) {
  let find = CryptoConversation.find({ participantUserIds: userId }, "conversationId");
  if (options.session) find = find.session(options.session);
  const conversations = await find.lean();
  const transitioned = [];
  for (const conversation of conversations) {
    const next = await transitionConversationRoster(
      { conversationId: conversation.conversationId },
      options
    );
    if (next) transitioned.push(next);
  }
  return transitioned;
}

module.exports = {
  normalizeClientIds,
  clientIdsHash,
  authorizedClientIds,
  operationIntentHash,
  cancelPendingOperations,
  transitionConversationRoster,
  transitionUserConversations
};
