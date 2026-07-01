const mongoose = require("mongoose");

const pendingEmailChangeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      index: true
    },
    oldEmailHash: {
      type: String,
      required: true,
      index: true
    },
    newEmailHash: {
      type: String,
      required: true,
      index: true
    },
    newEmailEnvelope: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    cancelTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "applied", "cancelled", "expired"],
      default: "pending",
      index: true
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    applyAfter: {
      type: Date,
      required: true,
      index: true
    },
    cancelExpiresAt: {
      type: Date,
      required: true,
      index: true
    },
    appliedAt: {
      type: Date,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

pendingEmailChangeSchema.index({ userId: 1, status: 1, createdAt: -1 });
pendingEmailChangeSchema.index({ newEmailHash: 1, status: 1, applyAfter: 1 });

module.exports =
  mongoose.models.PendingEmailChange ||
  mongoose.model("PendingEmailChange", pendingEmailChangeSchema);
