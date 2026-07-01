export const VAULT_STATUS = Object.freeze({
  NOT_CONFIGURED: "not_configured",
  PREPARED: "prepared",
  ACTIVE: "active",
  LOCKED: "locked"
});

export function isVaultConfigured(status) {
  return status === VAULT_STATUS.PREPARED || status === VAULT_STATUS.ACTIVE || status === VAULT_STATUS.LOCKED;
}

export function describeVaultState(status) {
  if (status === VAULT_STATUS.ACTIVE) return "Vault is active";
  if (status === VAULT_STATUS.PREPARED) return "Vault foundation is prepared";
  if (status === VAULT_STATUS.LOCKED) return "Vault is locked";
  return "Vault is not configured";
}
