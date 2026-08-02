"use strict";

const mongoose = require("mongoose");

const avatarUploadLeaseSchema = new mongoose.Schema({
  ownerKey: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.models.AvatarUploadLease ||
  mongoose.model("AvatarUploadLease", avatarUploadLeaseSchema);
