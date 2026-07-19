"use strict";

const mongoose = require("mongoose");

const messageVisibilitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  conversationId: { type: String, required: true, index: true },
  clientMessageId: { type: String, required: true },
  hiddenAt: { type: Date, default: Date.now }
}, { timestamps: true });

messageVisibilitySchema.index(
  { userId: 1, conversationId: 1, clientMessageId: 1 },
  { unique: true }
);
messageVisibilitySchema.index({ conversationId: 1, clientMessageId: 1 });

module.exports = mongoose.models.MessageVisibility ||
  mongoose.model("MessageVisibility", messageVisibilitySchema);
