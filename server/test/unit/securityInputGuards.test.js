"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const mongoSanitize = require("../../middleware/mongoSanitize");
const { COOKIE_NAME, getAuthCookie } = require("../../utils/authCookie");
const { verifyEmailCode } = require("../../controllers/auth/emailCodeService");
const {
  MAX_TOTP_INPUT_LENGTH,
  MAX_BACKUP_CODE_INPUT_LENGTH,
  normalizeSecondFactorInput,
  isValidatedSecondFactor
} = require("../../security/totp/secondFactorInput");

function runSanitizer(req) {
  const response = {
    statusCode: 0,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
  let nextError;
  let nextCalled = false;
  mongoSanitize(req, response, error => {
    nextCalled = true;
    nextError = error;
  });
  return { response, nextCalled, nextError };
}

test("Mongo request guard rejects operators instead of rewriting user input", () => {
  const body = JSON.parse('{"profile":{"$where":"return true"}}');
  const result = runSanitizer({ body, params: {}, query: {} });
  assert.equal(result.nextCalled, false);
  assert.equal(result.response.statusCode, 400);
  assert.deepEqual(result.response.body, { error: "invalid request fields" });
  assert.equal(body.profile.$where, "return true");
});

test("Mongo request guard preserves an accepted request by reference", () => {
  const body = { profile: { displayName: "Alice" }, values: [1, 2, 3] };
  const req = { body, params: { id: "123" }, query: { page: "1" } };
  const result = runSanitizer(req);
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
  assert.equal(req.body, body);
});

test("auth cookie reader selects only the configured cookie without dynamic properties", () => {
  const req = {
    headers: {
      cookie: `__proto__=pollution; other=value; ${COOKIE_NAME}=signed%20token`
    }
  };
  assert.equal(getAuthCookie(req), "signed token");
  assert.equal(Object.prototype.pollution, undefined);
});

test("email code lookup rejects unvalidated query components before MongoDB", async () => {
  await assert.rejects(
    verifyEmailCode({
      emailHash: { $ne: "" },
      purpose: { $ne: "" },
      code: "12345678"
    }),
    /invalid email code lookup/
  );
});

test("second-factor input rejects missing, empty and whitespace-only factors", () => {
  for (const input of [
    {},
    { totpCode: "", backupCode: "" },
    { totpCode: " \t\r\n ", backupCode: "   " }
  ]) {
    const result = normalizeSecondFactorInput(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "factor-required");
    assert.equal(result.factor, null);
  }
});

test("second-factor input normalizes one primitive TOTP candidate", () => {
  const result = normalizeSecondFactorInput({ totpCode: " 123 456 " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.factor, { totpCode: "123456", backupCode: "" });
  assert.equal(isValidatedSecondFactor(result.factor), true);
});

test("second-factor input normalizes one primitive backup-code candidate", () => {
  const result = normalizeSecondFactorInput({ backupCode: " abcd-ef12 gh34 " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.factor, { totpCode: "", backupCode: "ABCDEF12GH34" });
  assert.equal(isValidatedSecondFactor(result.factor), true);
});

test("second-factor input rejects simultaneous TOTP and backup-code candidates", () => {
  for (const input of [
    { totpCode: "123456", backupCode: "ABCD-EF12-GH34" },
    { totpCode: "000000", backupCode: "ABCD-EF12-GH34" },
    { totpCode: "123456", backupCode: "WRONG-CODE" }
  ]) {
    const result = normalizeSecondFactorInput(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "ambiguous-factor");
    assert.equal(result.factor, null);
  }
});

test("second-factor input rejects non-string values without coercion", () => {
  for (const value of [null, 123456, true, false, {}, [], ["123456"]]) {
    assert.equal(normalizeSecondFactorInput({ totpCode: value }).ok, false);
    assert.equal(normalizeSecondFactorInput({ backupCode: value }).ok, false);
  }
});

test("second-factor input rejects oversized values before verification", () => {
  assert.equal(normalizeSecondFactorInput({
    totpCode: "1".repeat(MAX_TOTP_INPUT_LENGTH + 1)
  }).ok, false);
  assert.equal(normalizeSecondFactorInput({
    backupCode: "A".repeat(MAX_BACKUP_CODE_INPUT_LENGTH + 1)
  }).ok, false);
});

test("second-factor input rejects malformed TOTP and backup codes", () => {
  for (const totpCode of ["12345", "1234567", "12A456", "12-34-56"]) {
    assert.equal(normalizeSecondFactorInput({ totpCode }).ok, false);
  }
  for (const backupCode of ["SHORT", "ABCD_EF12_GH34", "ABCD!EF12!GH34"]) {
    assert.equal(normalizeSecondFactorInput({ backupCode }).ok, false);
  }
});

test("second-factor legacy TOTP alias is accepted only when unambiguous", () => {
  const legacyOnly = normalizeSecondFactorInput({ legacyTotpCode: "123456" });
  assert.equal(legacyOnly.ok, true);
  assert.deepEqual(legacyOnly.factor, { totpCode: "123456", backupCode: "" });

  const identicalAliases = normalizeSecondFactorInput({
    totpCode: "123 456",
    legacyTotpCode: "123456"
  });
  assert.equal(identicalAliases.ok, true);

  const conflictingAliases = normalizeSecondFactorInput({
    totpCode: "123456",
    legacyTotpCode: "654321"
  });
  assert.equal(conflictingAliases.ok, false);
  assert.equal(conflictingAliases.reason, "conflicting-totp-aliases");

  const emptyCanonicalAlias = normalizeSecondFactorInput({
    totpCode: "",
    legacyTotpCode: "123456"
  });
  assert.equal(emptyCanonicalAlias.ok, false);
  assert.equal(emptyCanonicalAlias.reason, "conflicting-totp-aliases");
});
