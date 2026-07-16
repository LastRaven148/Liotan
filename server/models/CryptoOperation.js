const mongoose = require("mongoose");

const cryptoOperationSchema = new mongoose.Schema({
  operationId: { type: String, required: true, unique: true, index: true },
  conversationId: { type: String, required: true, index: true },
  type: { type: String, enum: ["init", "add", "remove", "update"], required: true },
  requestedByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  requestedByClientId: { type: String, required: true },
  addClientIds: [{ type: String }],
  removeClientIds: [{ type: String }],
  packageHashes: [{ type: String }],
  baseRosterVersion: { type: Number, required: true, min: 0 },
  baseEpoch: { type: Number, required: true, min: 0 },
  operationGeneration: { type: Number, required: true, min: 1 },
  baseActiveClientIdsHash: { type: String, required: true },
  authorizedClientIdsHash: { type: String, required: true },
  expectedActiveClientIds: [{ type: String }],
  expectedActiveClientIdsHash: { type: String, required: true },
  intentHash: { type: String, required: true },
  blockAfterCommit: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "committed", "expired", "cancelled"], default: "pending", index: true },
  cancellationReason: { type: String, default: "" },
  expiresAt: { type: Date, required: true },
  committedAt: { type: Date, default: null }
}, { timestamps: true });

cryptoOperationSchema.index(
  { conversationId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
cryptoOperationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.CryptoOperation || mongoose.model("CryptoOperation", cryptoOperationSchema);
