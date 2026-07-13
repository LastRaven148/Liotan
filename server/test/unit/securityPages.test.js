"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  sendRegistrationSecurityPage,
  sendSecurityPageCss,
  sendSimpleSecurityPage
} = require("../../controllers/auth/securityPages");
const { getRegistrationCancelUrl } = require("../../controllers/authController");

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    status(value) { this.statusCode = value; return this; },
    set(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
    end(value) { this.body = String(value || ""); return this; }
  };
}

test("security action pages use a CSP-compatible same-origin stylesheet", () => {
  const response = createResponse();
  sendRegistrationSecurityPage(response, {
    token: "a".repeat(48),
    record: {
      createdAt: new Date("2026-01-01T10:00:00Z"),
      expiresAt: new Date("2026-01-04T10:00:00Z"),
      deviceName: "Windows · Edge",
      browserName: "Edge",
      osName: "Windows",
      ipHint: "203.0.xxx.xxx"
    },
    req: { headers: { "accept-language": "ru" } }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<link rel="stylesheet" href="\/security\/security-pages\.css"/);
  assert.doesNotMatch(response.body, /<style\b|\sstyle=/i);
  assert.match(response.body, /Это не я/);
});

test("simple security result pages also avoid inline styles", () => {
  const response = createResponse();
  sendSimpleSecurityPage(response, { ok: true, title: "Готово", message: "Сессия завершена" });
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(response.body, /<style\b|\sstyle=/i);
  assert.match(response.body, /security-pages\.css/);
});

test("security stylesheet is served as CSS with every required action class", () => {
  const response = createResponse();
  sendSecurityPageCss({}, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /^text\/css/);
  for (const selector of [".card", ".details", ".danger", ".danger-dark", ".ghost", ".input", ".is-danger"]) {
    assert.match(response.body, new RegExp(selector.replace(".", "\\.")));
  }
});

test("security email links use the dedicated security origin", () => {
  const previous = process.env.PUBLIC_SECURITY_URL;
  process.env.PUBLIC_SECURITY_URL = "https://security.liotan.com/";
  try {
    assert.equal(
      getRegistrationCancelUrl("token/value"),
      "https://security.liotan.com/auth/register/cancel/token%2Fvalue"
    );
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_SECURITY_URL;
    else process.env.PUBLIC_SECURITY_URL = previous;
  }
});
