"use strict";

const { normalizeBackupCode } = require("../recovery/backupCodes");

const MAX_TOTP_INPUT_LENGTH = 32;
const MAX_BACKUP_CODE_INPUT_LENGTH = 64;
const validatedFactors = new WeakSet();

function absentCandidate() {
  return { supplied: false, valid: true, present: false, value: "" };
}

function invalidCandidate() {
  return { supplied: true, valid: false, present: true, value: "" };
}

function normalizeTotpCandidate(raw) {
  if (raw === undefined) return absentCandidate();
  if (typeof raw !== "string" || raw.length > MAX_TOTP_INPUT_LENGTH) {
    return invalidCandidate();
  }

  const value = raw.replace(/\s+/g, "");
  if (!value) return { supplied: true, valid: true, present: false, value: "" };
  return /^\d{6}$/.test(value)
    ? { supplied: true, valid: true, present: true, value }
    : invalidCandidate();
}

function normalizeBackupCandidate(raw) {
  if (raw === undefined) return absentCandidate();
  if (typeof raw !== "string" || raw.length > MAX_BACKUP_CODE_INPUT_LENGTH) {
    return invalidCandidate();
  }

  const trimmed = raw.trim();
  if (!trimmed) return { supplied: true, valid: true, present: false, value: "" };
  if (!/^[a-zA-Z0-9\s-]+$/.test(trimmed)) return invalidCandidate();

  const value = normalizeBackupCode(trimmed);
  return /^[A-Z0-9]{8,20}$/.test(value)
    ? { supplied: true, valid: true, present: true, value }
    : invalidCandidate();
}

function invalidResult(reason) {
  return Object.freeze({ ok: false, reason, factor: null });
}

function normalizeSecondFactorInput({
  totpCode,
  legacyTotpCode,
  backupCode
} = {}) {
  const canonicalTotp = normalizeTotpCandidate(totpCode);
  const legacyTotp = normalizeTotpCandidate(legacyTotpCode);
  const backup = normalizeBackupCandidate(backupCode);

  if (!canonicalTotp.valid || !legacyTotp.valid || !backup.valid) {
    return invalidResult("invalid-factor");
  }
  if (
    canonicalTotp.supplied &&
    legacyTotp.supplied &&
    canonicalTotp.value !== legacyTotp.value
  ) {
    return invalidResult("conflicting-totp-aliases");
  }

  const totp = canonicalTotp.present ? canonicalTotp : legacyTotp;
  const factorCount = Number(totp.present) + Number(backup.present);
  if (factorCount === 0) return invalidResult("factor-required");
  if (factorCount !== 1) return invalidResult("ambiguous-factor");

  const factor = Object.freeze({
    totpCode: totp.present ? totp.value : "",
    backupCode: backup.present ? backup.value : ""
  });
  validatedFactors.add(factor);
  return Object.freeze({ ok: true, reason: null, factor });
}

function isValidatedSecondFactor(factor) {
  return Boolean(factor && typeof factor === "object" && validatedFactors.has(factor));
}

module.exports = {
  MAX_TOTP_INPUT_LENGTH,
  MAX_BACKUP_CODE_INPUT_LENGTH,
  normalizeSecondFactorInput,
  isValidatedSecondFactor
};
