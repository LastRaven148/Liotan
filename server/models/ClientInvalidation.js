"use strict";

const mongoose = require("mongoose");

const clientInvalidationSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  kind: {
    type: String,
    enum: [
      "conversation-deleted",
      "account-deleted",
      "message-hidden",
      "notification-settings-updated",
      "blocklist-updated",
      "device-list-updated"
    ],
    required: true,
    index: true
  },
  conversationId: { type: String, default: "", index: true },
  clientMessageId: { type: String, default: "" },
  groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
  pendingClientIds: { type: [String], default: [] },
  acknowledgedClientIds: { type: [String], default: [] },
  payloadVersion: { type: Number, default: 1, min: 1 },
  acknowledgedAt: { type: Date, default: null }
}, { timestamps: true });

clientInvalidationSchema.index({ recipientUserId: 1, createdAt: 1, _id: 1 });
clientInvalidationSchema.index({ recipientUserId: 1, pendingClientIds: 1, createdAt: 1 });
clientInvalidationSchema.index(
  { recipientUserId: 1, kind: 1, conversationId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { kind: "message-hidden" } }
);

module.exports = mongoose.models.ClientInvalidation ||
  mongoose.model("ClientInvalidation", clientInvalidationSchema);
