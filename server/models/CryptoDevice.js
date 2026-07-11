const mongoose = require("mongoose");

const cryptoDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  username: { type: String, required: true, index: true },
  cryptoUserId: { type: String, required: true, index: true },
  deviceId: { type: String, required: true },
  clientId: { type: String, required: true, unique: true, index: true },
  requestPublicKey: { type: String, required: true },
  credentialThumbprint: { type: String, required: true },
  manifest: { type: mongoose.Schema.Types.Mixed, required: true },
  manifestSignature: { type: String, required: true },
  manifestExpiresAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ["active", "expired", "revoked"], default: "active", index: true },
  verifiedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

cryptoDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
cryptoDeviceSchema.index({ userId: 1, status: 1, updatedAt: -1 });
cryptoDeviceSchema.index({ userId: 1, status: 1, manifestExpiresAt: 1 });

module.exports = mongoose.models.CryptoDevice || mongoose.model("CryptoDevice", cryptoDeviceSchema);
