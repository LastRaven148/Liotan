"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const ClientInvalidation = require("../models/ClientInvalidation");
const CryptoDevice = require("../models/CryptoDevice");
const User = require("../models/User");
const UserBlock = require("../models/UserBlock");
const { isValidUsername } = require("../utils/validators");
const { userRoom } = require("../sockets/sessionRegistry");

function encodeCursor(item) {
  return item ? Buffer.from(JSON.stringify({ createdAt: item.createdAt, id: item._id }), "utf8").toString("base64url") : "";
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!mongoose.isValidObjectId(parsed.id) || !Number.isFinite(createdAt.getTime())) throw new Error();
    return { createdAt, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    const error = new Error("invalid cursor"); error.status = 400; throw error;
  }
}

async function publishUpdate(req) {
  const devices = await CryptoDevice.find({
    userId: req.user.userId,
    status: "active",
    manifestExpiresAt: { $gt: new Date() }
  }, "clientId").lean();
  const invalidation = await ClientInvalidation.create({
    eventId: crypto.randomBytes(24).toString("base64url"),
    recipientUserId: req.user.userId,
    kind: "blocklist-updated",
    pendingClientIds: devices.map(device => device.clientId)
  });
  req.app.get("io")?.to(userRoom(String(req.user.userId))).emit("clientInvalidationAvailable", {
    eventId: invalidation.eventId,
    kind: invalidation.kind
  });
}

async function listBlocks(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 50, 100));
    const cursor = decodeCursor(req.query.cursor);
    const query = { blockerUserId: req.user.userId };
    if (cursor) query.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }
    ];
    const blocks = await UserBlock.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = blocks.length > limit;
    const page = blocks.slice(0, limit);
    const users = await User.find({ _id: { $in: page.map(block => block.blockedUserId) } }, "username displayName avatar").lean();
    const byId = new Map(users.map(user => [String(user._id), user]));
    return res.json({
      blocks: page.map(block => {
        const user = byId.get(String(block.blockedUserId));
        return {
          username: user?.username || "",
          displayName: user?.displayName || "",
          avatar: user?.avatar || "",
          blockedAt: block.createdAt
        };
      }).filter(item => item.username),
      hasMore,
      nextCursor: hasMore ? encodeCursor(page.at(-1)) : ""
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}

async function blockUser(req, res, next) {
  try {
    const username = String(req.params.username || "").trim();
    if (!isValidUsername(username) || username === req.user.username) return res.status(400).json({ error: "invalid username" });
    const target = await User.findOne({ username, emailVerified: true, lifecycleState: { $ne: "deleting" } }, "_id").lean();
    if (!target) return res.status(404).json({ error: "user not found" });
    const result = await UserBlock.updateOne(
      { blockerUserId: req.user.userId, blockedUserId: target._id },
      { $setOnInsert: { blockerUserId: req.user.userId, blockedUserId: target._id } },
      { upsert: true }
    );
    if (result.upsertedCount) await publishUpdate(req);
    return res.status(result.upsertedCount ? 201 : 200).json({ ok: true, username, duplicate: !result.upsertedCount });
  } catch (error) {
    if (error?.code === 11000) return res.status(200).json({ ok: true, duplicate: true });
    return next(error);
  }
}

async function unblockUser(req, res, next) {
  try {
    const username = String(req.params.username || "").trim();
    if (!isValidUsername(username) || username === req.user.username) return res.status(400).json({ error: "invalid username" });
    const target = await User.findOne({ username }, "_id").lean();
    if (!target) return res.json({ ok: true, username, duplicate: true });
    const result = await UserBlock.deleteOne({ blockerUserId: req.user.userId, blockedUserId: target._id });
    if (result.deletedCount) await publishUpdate(req);
    return res.json({ ok: true, username, duplicate: !result.deletedCount });
  } catch (error) {
    return next(error);
  }
}

module.exports = { blockUser, decodeCursor, encodeCursor, listBlocks, unblockUser };
