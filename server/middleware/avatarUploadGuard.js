"use strict";

const crypto = require("node:crypto");
const AvatarUploadLease = require("../models/AvatarUploadLease");
const User = require("../models/User");
const Group = require("../models/Group");

const LEASE_MS = 2 * 60 * 1000;

async function acquireLease(ownerKey) {
  const token = crypto.randomBytes(24).toString("base64url");
  await AvatarUploadLease.deleteOne({ ownerKey, expiresAt: { $lte: new Date() } });
  try {
    await AvatarUploadLease.create({
      ownerKey,
      token,
      expiresAt: new Date(Date.now() + LEASE_MS)
    });
  } catch (err) {
    if (err?.code === 11000) {
      const conflict = new Error("another avatar upload is already in progress");
      conflict.status = 429;
      throw conflict;
    }
    throw err;
  }
  return { ownerKey, token };
}

function attachLease(req, res, lease) {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    AvatarUploadLease.deleteOne(lease).catch(() => {});
  };
  res.once("finish", release);
  res.once("close", release);
  req.releaseAvatarUploadLease = release;
}

async function guardUserAvatarUpload(req, res, next) {
  try {
    const user = await User.findOne({
      _id: req.user.userId,
      username: req.user.username,
      lifecycleState: { $ne: "deleting" }
    });
    if (!user) return res.status(404).json({ error: "not found" });
    const lease = await acquireLease(`user:${user._id}`);
    req.avatarOwnerDocument = user;
    attachLease(req, res, lease);
    return next();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

async function guardGroupAvatarUpload(req, res, next) {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      lifecycleState: { $ne: "deleting" },
      $or: [{ owner: req.user.username }, { admins: req.user.username }]
    });
    if (!group) return res.status(404).json({ error: "group not found or access denied" });
    const lease = await acquireLease(`group:${group._id}`);
    req.avatarOwnerDocument = group;
    attachLease(req, res, lease);
    return next();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

module.exports = {
  guardUserAvatarUpload,
  guardGroupAvatarUpload
};
