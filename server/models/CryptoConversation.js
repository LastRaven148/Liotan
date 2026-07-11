const mongoose = require("mongoose");

const cryptoConversationSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true, index: true },
  lookupKey: { type: String, required: true, unique: true, index: true },
  chatType: { type: String, enum: ["private", "group"], required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  participantUserIds: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
  participantUsernames: [{ type: String, required: true }],
  adminUserIds: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
  activeClientIds: [{ type: String }],
  protocol: { type: String, enum: ["mls-1.0"], default: "mls-1.0" },
  initialized: { type: Boolean, default: false },
  blockedForEpochChange: { type: Boolean, default: true, index: true },
  epoch: { type: Number, default: 0 },
  sequence: { type: Number, default: 0 },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByClientId: { type: String, required: true },
  lastCommitAt: { type: Date, default: null }
}, { timestamps: true });

cryptoConversationSchema.index({ participantUserIds: 1, updatedAt: -1 });

module.exports = mongoose.models.CryptoConversation || mongoose.model("CryptoConversation", cryptoConversationSchema);
