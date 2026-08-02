"use strict";

const mongoose = require("mongoose");

const mediaQuotaBucketSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  scope: {
    type: String,
    enum: ["global", "account", "device", "session", "ip"],
    required: true
  },
  scopeIdHash: { type: String, required: true },
  direction: { type: String, enum: ["upload", "download"], required: true },
  window: { type: String, enum: ["minute", "hour", "day"], required: true },
  windowStartedAt: { type: Date, required: true },
  bytes: { type: Number, default: 0, min: 0 },
  requests: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

mediaQuotaBucketSchema.index({ scope: 1, scopeIdHash: 1, direction: 1, windowStartedAt: -1 });

module.exports = mongoose.models.MediaQuotaBucket ||
  mongoose.model("MediaQuotaBucket", mediaQuotaBucketSchema);
