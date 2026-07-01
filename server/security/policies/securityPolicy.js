const HOURS = 60 * 60 * 1000;

module.exports = Object.freeze({
  version: "48.5.0",
  principles: Object.freeze({
    serverTrust: "untrusted",
    supportTrust: "untrusted",
    storageTrust: "untrusted",
    networkTrust: "untrusted",
    userDataOwner: "user"
  }),
  emailChange: Object.freeze({
    securityWindowHours: Number(process.env.EMAIL_CHANGE_SECURITY_WINDOW_HOURS || 72),
    cancelWindowHours: Number(process.env.EMAIL_CHANGE_CANCEL_WINDOW_HOURS || 72),
    requireCurrentEmail: true,
    requireNewEmail: true,
    requireSecondFactorWhenEnabled: true,
    revokeOtherSessionsAfterApply: true
  }),
  recovery: Object.freeze({
    backupCodeCount: Number(process.env.RECOVERY_BACKUP_CODE_COUNT || 10),
    backupCodeBytes: Number(process.env.RECOVERY_BACKUP_CODE_BYTES || 10),
    securityDelayMs: Number(process.env.RECOVERY_SECURITY_DELAY_HOURS || 24) * HOURS,
    supportCanGrantAccess: false,
    supportCanReset2FA: false,
    supportCanViewSecrets: false
  }),
  totp: Object.freeze({
    issuer: process.env.TOTP_ISSUER || "Liotan",
    digits: 6,
    period: 30,
    window: Number(process.env.TOTP_VALIDATION_WINDOW || 1),
    secretBytes: Number(process.env.TOTP_SECRET_BYTES || 20)
  }),
  vault: Object.freeze({
    enabledByDefault: false,
    serverStoresPlaintextVaultKey: false,
    serverCanRecoverVault: false,
    kdf: "PBKDF2-SHA256",
    kdfIterations: Number(process.env.VAULT_KDF_ITERATIONS || 310000)
  }),
  devices: Object.freeze({
    newDeviceApprovalRequiredWhenAvailable: true,
    supportCanApproveDevice: false,
    qrChallengeTtlSeconds: Number(process.env.DEVICE_QR_CHALLENGE_TTL_SECONDS || 120),
    trustChallengeTtlSeconds: Number(process.env.DEVICE_TRUST_CHALLENGE_TTL_SECONDS || 600)
  })
});
