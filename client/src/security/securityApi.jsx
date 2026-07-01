import { apiRequest } from "../utils/apiRequest.jsx";

export function getSecurityStatus() {
  return apiRequest("/security/status");
}

export function getSecurityPolicy() {
  return apiRequest("/security/policy");
}

export function startTotpSetup() {
  return apiRequest("/security/totp/setup", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function enableTotp(code) {
  return apiRequest("/security/totp/enable", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function disableTotp({ code, backupCode } = {}) {
  return apiRequest("/security/totp/disable", {
    method: "POST",
    body: JSON.stringify({ code, backupCode })
  });
}

export function prepareVault() {
  return apiRequest("/security/vault/prepare", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function rotateRecoveryCodes() {
  return apiRequest("/security/recovery/backup-codes", {
    method: "POST",
    body: JSON.stringify({})
  });
}
