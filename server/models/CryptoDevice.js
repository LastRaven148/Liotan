const mongoose = require("mongoose");

const cryptoDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  username: { type: String, required: true, index: true },
  cryptoUserId: { type: String, required: true, index: true },
  deviceId: { type: String, required: true },
  clientId: { type: String, required: true, unique: true, index: true },
  requestPublicKey: { type: String, required: true },
  authVersion: { type: Number, enum: [1, 2], default: 1, index: true },
  authProtocol: { type: String, default: "liotan-device-auth-v1" },
  sessionBindingId: { type: String, default: "" },
  authMigrationState: {
    type: String,
    enum: ["legacy", "v2-active"],
    default: "legacy",
    index: true
  },
  authMigratedAt: { type: Date, default: null },
  credentialThumbprint: { type: String, required: true },
  sessionIdHash: { type: String, default: "", index: true },
  manifest: { type: mongoose.Schema.Types.Mixed, required: true },
  manifestSignature: { type: String, required: true },
  manifestExpiresAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ["pending", "active", "expired", "revoked"], default: "pending", index: true },
  activationMode: {
    type: String,
    enum: ["initial", "device-approval", "recovery-bootstrap", "recovery-enrollment", "legacy-migrated"],
    default: "device-approval"
  },
  approvalChallenge: { type: String, default: "" },
  approval: { type: mongoose.Schema.Types.Mixed, default: null },
  approvalSignature: { type: String, default: "" },
  approvedByClientId: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  revocation: { type: mongoose.Schema.Types.Mixed, default: null },
  revocationSignature: { type: String, default: "" },
  verifiedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

cryptoDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
cryptoDeviceSchema.index({ userId: 1, status: 1, updatedAt: -1 });
cryptoDeviceSchema.index({ userId: 1, status: 1, manifestExpiresAt: 1 });

module.exports = mongoose.models.CryptoDevice || mongoose.model("CryptoDevice", cryptoDeviceSchema);
