"use strict";

const mongoose = require("mongoose");

const deletionObjectTaskSchema = new mongoose.Schema({
  workflowId: { type: String, required: true, index: true },
  locatorHash: { type: String, required: true },
  locator: { type: String, required: true },
  storageType: { type: String, required: true },
  storageClass: { type: String, enum: ["private-media", "public-avatar"], required: true },
  source: { type: String, enum: ["account-avatar", "group-avatar", "message", "attachment-upload"], required: true },
  state: { type: String, enum: ["pending", "deleted", "dead-letter"], default: "pending", index: true },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastErrorCode: { type: String, default: "" },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

deletionObjectTaskSchema.index({ workflowId: 1, locatorHash: 1 }, { unique: true });
deletionObjectTaskSchema.index({ workflowId: 1, state: 1, nextAttemptAt: 1 });

module.exports = mongoose.models.DeletionObjectTask ||
  mongoose.model("DeletionObjectTask", deletionObjectTaskSchema);
