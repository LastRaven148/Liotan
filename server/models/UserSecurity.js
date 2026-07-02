const mongoose = require("mongoose");

const userSecuritySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true
    },
    username: {
      type: String,
      required: true
    },
    totp: {
      enabled: { type: Boolean, default: false },
      secretEnvelope: { type: mongoose.Schema.Types.Mixed, default: null },
      pendingSecretEnvelope: { type: mongoose.Schema.Types.Mixed, default: null },
      enabledAt: { type: Date, default: null },
      lastUsedStep: { type: Number, default: null },
      backupCodeHashes: { type: [String], default: [] }
    },
    vault: {
      status: {
        type: String,
        enum: ["not_configured", "prepared", "active", "locked"],
        default: "not_configured"
      },
      vaultId: { type: String, default: "" },
      wrappedMasterKey: { type: mongoose.Schema.Types.Mixed, default: null },
      kdf: {
        name: { type: String, default: "PBKDF2-SHA256" },
        iterations: { type: Number, default: 310000 },
        salt: { type: String, default: "" }
      },
      createdAt: { type: Date, default: null },
      rotatedAt: { type: Date, default: null }
    },
    recovery: {
      backupCodeHashes: { type: [String], default: [] },
      recoveryPhraseVerifier: { type: String, default: "" },
      lastRecoveryAt: { type: Date, default: null },
      recoveryLockedUntil: { type: Date, default: null }
    },
    deviceTrust: {
      trustedDeviceFingerprints: { type: [String], default: [] },
      pendingDeviceChallenges: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    highRiskLock: {
      lockedUntil: { type: Date, default: null },
      reason: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

userSecuritySchema.index({ username: 1 });
userSecuritySchema.index({ "vault.vaultId": 1 }, { sparse: true });

module.exports = mongoose.models.UserSecurity || mongoose.model("UserSecurity", userSecuritySchema);
