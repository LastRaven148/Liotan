"use strict";

const mongoose = require("mongoose");

const mediaQuotaStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  scope: {
    type: String,
    enum: ["global", "account", "device", "session", "ip"],
    required: true
  },
  scopeIdHash: { type: String, required: true },
  activeUploads: { type: Number, default: 0, min: 0 },
  activeDownloads: { type: Number, default: 0, min: 0 },
  reservedStorageBytes: { type: Number, default: 0, min: 0 },
  temporaryStorageBytes: { type: Number, default: 0, min: 0 },
  persistentStorageBytes: { type: Number, default: 0, min: 0 },
  objectCount: { type: Number, default: 0, min: 0 },
  reconciledAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.models.MediaQuotaState ||
  mongoose.model("MediaQuotaState", mediaQuotaStateSchema);
