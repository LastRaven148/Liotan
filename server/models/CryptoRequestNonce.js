const mongoose = require("mongoose");

const cryptoRequestNonceSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  nonce: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: false });

cryptoRequestNonceSchema.index({ clientId: 1, nonce: 1 }, { unique: true });
cryptoRequestNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.CryptoRequestNonce || mongoose.model("CryptoRequestNonce", cryptoRequestNonceSchema);
