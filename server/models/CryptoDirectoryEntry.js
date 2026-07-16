const mongoose = require("mongoose");

const cryptoDirectoryEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  cryptoUserId: { type: String, required: true, index: true },
  version: { type: Number, required: true, min: 1 },
  previousHash: { type: String, required: true },
  hash: { type: String, required: true },
  statement: { type: mongoose.Schema.Types.Mixed, required: true },
  signature: { type: String, required: true }
}, { timestamps: true });

cryptoDirectoryEntrySchema.index({ userId: 1, version: 1 }, { unique: true });
cryptoDirectoryEntrySchema.index({ cryptoUserId: 1, version: 1 }, { unique: true });

module.exports = mongoose.models.CryptoDirectoryEntry ||
  mongoose.model("CryptoDirectoryEntry", cryptoDirectoryEntrySchema);
