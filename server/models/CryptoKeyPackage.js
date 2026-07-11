const mongoose = require("mongoose");

const cryptoKeyPackageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  cryptoUserId: { type: String, required: true, index: true },
  deviceId: { type: String, required: true, index: true },
  clientId: { type: String, required: true, index: true },
  packageHash: { type: String, required: true, unique: true, index: true },
  payload: { type: String, required: true },
  batchHash: { type: String, required: true },
  batchSignature: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  claimedAt: { type: Date, default: null, index: true },
  claimedBy: { type: String, default: "" },
  conversationId: { type: String, default: "", index: true }
}, { timestamps: true });

cryptoKeyPackageSchema.index({ clientId: 1, claimedAt: 1, expiresAt: 1 });
cryptoKeyPackageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.CryptoKeyPackage || mongoose.model("CryptoKeyPackage", cryptoKeyPackageSchema);
