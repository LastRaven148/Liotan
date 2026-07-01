export function normalizeBackupCode(code) {
  return String(code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isProbablyBackupCode(code) {
  return normalizeBackupCode(code).length >= 12;
}
