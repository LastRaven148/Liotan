const mongoose = require("mongoose");

const cryptoConversationSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true, index: true },
  lookupKey: { type: String, required: true, unique: true, index: true },
  chatType: { type: String, enum: ["private", "group"], required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  participantUserIds: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
  participantUsernames: [{ type: String, required: true }],
  adminUserIds: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
  // The roster committed in the opaque MLS state. It changes only after a
  // successful membership commit.
  activeClientIds: [{ type: String }],
  // The server policy roster. Revocation and membership changes update this
  // immediately, before another application message may be accepted.
  authorizedClientIds: [{ type: String }],
  rosterVersion: { type: Number, default: 0, min: 0 },
  operationGeneration: { type: Number, default: 0, min: 0 },
  protocol: { type: String, enum: ["mls-1.0"], default: "mls-1.0" },
  initialized: { type: Boolean, default: false },
  blockedForEpochChange: { type: Boolean, default: true, index: true },
  epoch: { type: Number, default: 0 },
  sequence: { type: Number, default: 0 },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByClientId: { type: String, required: true },
  lastCommitAt: { type: Date, default: null },
  lifecycleState: { type: String, enum: ["active", "deleting"], default: "active", index: true },
  deletionWorkflowId: { type: String, default: "", index: true },
  deletionGeneration: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

cryptoConversationSchema.index({ participantUserIds: 1, updatedAt: -1 });
cryptoConversationSchema.index({ rosterVersion: 1 });

module.exports = mongoose.models.CryptoConversation || mongoose.model("CryptoConversation", cryptoConversationSchema);
