"use strict";

const mongoose = require("mongoose");

const avatarObjectSchema = new mongoose.Schema({
  storageKey: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  storageType: { type: String, required: true },
  ownerType: { type: String, enum: ["user", "group"], required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  avatarVersion: { type: Number, required: true, min: 1 },
  state: {
    type: String,
    enum: ["uploaded", "active", "deletion-pending", "deleted", "dead-letter"],
    default: "uploaded",
    index: true
  },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastErrorCode: { type: String, default: "" },
  activatedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

avatarObjectSchema.index({ state: 1, nextAttemptAt: 1 });

module.exports = mongoose.models.AvatarObject ||
  mongoose.model("AvatarObject", avatarObjectSchema);
