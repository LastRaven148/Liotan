function getSupportPolicy() {
  return {
    canGrantAccountAccess: false,
    canChangeEmailManually: false,
    canDisable2FA: false,
    canReadMessages: false,
    canRecoverVault: false,
    allowedActions: [
      "explain_recovery_flow",
      "receive_abuse_report",
      "freeze_high_risk_operations",
      "restrict_abusive_account",
      "delete_account_by_verified_flow"
    ],
    deniedActions: [
      "manual_account_takeover",
      "manual_email_change",
      "manual_2fa_reset",
      "manual_device_approval",
      "message_decryption",
      "vault_recovery"
    ]
  };
}

module.exports = {
  getSupportPolicy
};
