"use strict";

const mongoose = require("mongoose");

const deletionWorkflowSchema = new mongoose.Schema({
  workflowId: { type: String, required: true, unique: true, index: true },
  type: { type: String, enum: ["account", "conversation"], required: true, index: true },
  subjectKeyHash: { type: String, required: true, index: true },
  idempotencyKeyHash: { type: String, required: true, unique: true, index: true },
  requestedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  requestedByUsername: { type: String, default: "" },
  accountUserId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  accountUsername: { type: String, default: "" },
  targetConversationId: { type: String, default: "", index: true },
  targetLookupKeyHash: { type: String, default: "", index: true },
  conversationIds: { type: [String], default: [] },
  legacyConversationIds: { type: [String], default: [] },
  groupIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  participantUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  participantUsernames: { type: [String], default: [] },
  state: {
    type: String,
    enum: [
      "requested",
      "planning",
      "planned",
      "frozen",
      "media-deleting",
      "server-data-deleting",
      "invalidating",
      "reconciling",
      "completed",
      "dead-letter"
    ],
    default: "requested",
    index: true
  },
  terminal: { type: Boolean, default: false, index: true },
  leaseOwner: { type: String, default: "", index: true },
  leaseExpiresAt: { type: Date, default: null, index: true },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  attempts: { type: Number, default: 0, min: 0 },
  lastErrorCode: { type: String, default: "" },
  counters: {
    conversations: { type: Number, default: 0, min: 0 },
    groups: { type: Number, default: 0, min: 0 },
    messages: { type: Number, default: 0, min: 0 },
    mediaObjects: { type: Number, default: 0, min: 0 },
    invalidations: { type: Number, default: 0, min: 0 }
  },
  completedAt: { type: Date, default: null },
  anonymizedAt: { type: Date, default: null }
}, { timestamps: true });

deletionWorkflowSchema.index(
  { subjectKeyHash: 1, terminal: 1 },
  { unique: true, partialFilterExpression: { terminal: false } }
);
deletionWorkflowSchema.index({ terminal: 1, nextAttemptAt: 1, leaseExpiresAt: 1, createdAt: 1 });

module.exports = mongoose.models.DeletionWorkflow ||
  mongoose.model("DeletionWorkflow", deletionWorkflowSchema);
