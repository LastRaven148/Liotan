"use strict";

const mongoose = require("mongoose");

const userBlockSchema = new mongoose.Schema({
  blockerUserId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  blockedUserId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }
}, { timestamps: true });

userBlockSchema.index({ blockerUserId: 1, blockedUserId: 1 }, { unique: true });
userBlockSchema.index({ blockedUserId: 1, blockerUserId: 1 });

module.exports = mongoose.models.UserBlock || mongoose.model("UserBlock", userBlockSchema);
