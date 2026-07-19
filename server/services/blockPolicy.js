"use strict";

const User = require("../models/User");
const UserBlock = require("../models/UserBlock");

function idString(value) {
  return String(value?._id || value || "");
}

async function hasBlockBetweenIds(leftUserId, rightUserId, { session = null } = {}) {
  if (!leftUserId || !rightUserId || idString(leftUserId) === idString(rightUserId)) return false;
  let query = UserBlock.exists({
    $or: [
      { blockerUserId: leftUserId, blockedUserId: rightUserId },
      { blockerUserId: rightUserId, blockedUserId: leftUserId }
    ]
  });
  if (session) query = query.session(session);
  return Boolean(await query);
}

async function userIdsForUsernames(usernames, { session = null } = {}) {
  let query = User.find({ username: { $in: [...new Set(usernames.filter(Boolean))] } }, "username");
  if (session) query = query.session(session);
  const users = await query.lean();
  return new Map(users.map(user => [user.username, user._id]));
}

async function hasBlockBetweenUsernames(leftUsername, rightUsername, options = {}) {
  if (!leftUsername || !rightUsername || leftUsername === rightUsername) return false;
  const ids = await userIdsForUsernames([leftUsername, rightUsername], options);
  if (!ids.has(leftUsername) || !ids.has(rightUsername)) return false;
  return hasBlockBetweenIds(ids.get(leftUsername), ids.get(rightUsername), options);
}

async function assertPrivateInteractionAllowed(leftUserId, rightUserId, options = {}) {
  if (await hasBlockBetweenIds(leftUserId, rightUserId, options)) {
    const error = new Error("private interaction unavailable");
    error.status = 403;
    error.code = "PRIVATE_INTERACTION_UNAVAILABLE";
    throw error;
  }
}

async function blockedUserIdsFor(userId) {
  const blocks = await UserBlock.find({
    $or: [{ blockerUserId: userId }, { blockedUserId: userId }]
  }, "blockerUserId blockedUserId").lean();
  return blocks.map(block => idString(block.blockerUserId) === idString(userId)
    ? block.blockedUserId
    : block.blockerUserId);
}

module.exports = {
  assertPrivateInteractionAllowed,
  blockedUserIdsFor,
  hasBlockBetweenIds,
  hasBlockBetweenUsernames,
  userIdsForUsernames
};
