const mongoose = require("mongoose");

const cryptoIdentitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
  username: { type: String, required: true, unique: true, index: true },
  cryptoUserId: { type: String, required: true, unique: true, index: true },
  rootPublicKey: { type: String, default: "" },
  rootFingerprint: { type: String, default: "" },
  rootCreatedAt: { type: Date, default: null },
  resetCounter: { type: Number, default: 0 },
  resetAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.models.CryptoIdentity || mongoose.model("CryptoIdentity", cryptoIdentitySchema);
