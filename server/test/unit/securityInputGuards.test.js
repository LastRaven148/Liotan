"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const mongoSanitize = require("../../middleware/mongoSanitize");
const { COOKIE_NAME, getAuthCookie } = require("../../utils/authCookie");
const { verifyEmailCode } = require("../../controllers/auth/emailCodeService");

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
