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
    },
    cancellationRequestedAt: {
      type: Date,
      default: null
    },
    cancellationFinalizedAt: {
      type: Date,
      default: null
    },
    cancellationLeaseOwner: {
      type: String,
      default: ""
    },
    cancellationLeaseExpiresAt: {
      type: Date,
      default: null
    },
    cancellationRetryAt: {
      type: Date,
      default: null
    },
    cancellationAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    cancellationLastErrorAt: {
      type: Date,
      default: null
    },
    cancellationLastErrorCode: {
      type: String,
      default: "",
      maxlength: 80
    }
  },
  { timestamps: true }
);

pendingEmailChangeSchema.index({ userId: 1, status: 1, createdAt: -1 });
pendingEmailChangeSchema.index({ newEmailHash: 1, status: 1, applyAfter: 1 });
pendingEmailChangeSchema.index({
  status: 1,
  cancellationFinalizedAt: 1,
  cancellationRetryAt: 1,
  cancellationLeaseExpiresAt: 1
});

module.exports =
  mongoose.models.PendingEmailChange ||
  mongoose.model("PendingEmailChange", pendingEmailChangeSchema);
