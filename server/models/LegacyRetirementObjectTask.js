"use strict";

const mongoose = require("mongoose");

const legacyRetirementObjectTaskSchema = new mongoose.Schema({
  migrationId: { type: String, required: true, index: true },
  locatorHash: { type: String, required: true },
  locator: { type: String, required: true },
  storageType: { type: String, enum: ["r2", "local"], required: true },
  storageClass: {
    type: String,
    enum: ["private-media"],
    default: "private-media"
  },
  state: {
    type: String,
    enum: ["pending", "deleted", "dead-letter"],
    default: "pending",
    index: true
  },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastErrorCode: { type: String, default: "" },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

legacyRetirementObjectTaskSchema.index(
  { migrationId: 1, locatorHash: 1 },
  { unique: true }
);
legacyRetirementObjectTaskSchema.index(
  { migrationId: 1, state: 1, nextAttemptAt: 1 }
);

module.exports = mongoose.models.LegacyRetirementObjectTask ||
  mongoose.model("LegacyRetirementObjectTask", legacyRetirementObjectTaskSchema);
