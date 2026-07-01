import { API } from "../config/api.jsx";
import { apiRequest } from "../utils/apiRequest.jsx";

export function getSecurityStatus() {
  return apiRequest(`${API}/security/status`);
}

export function getSecurityPolicy() {
  return apiRequest(`${API}/security/policy`);
}

export function startTotpSetup() {
  return apiRequest(`${API}/security/totp/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

export function enableTotp(code) {
  return apiRequest(`${API}/security/totp/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
}

export function disableTotp({ code, backupCode } = {}) {
  return apiRequest(`${API}/security/totp/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, backupCode })
  });
}

export function prepareVault() {
  return apiRequest(`${API}/security/vault/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

export function rotateRecoveryCodes() {
  return apiRequest(`${API}/security/recovery/backup-codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}
