export function normalizeTotpCode(code) {
  return String(code || "").replace(/\s+/g, "");
}

export function isTotpCode(code) {
  return /^\d{6}$/.test(normalizeTotpCode(code));
}
