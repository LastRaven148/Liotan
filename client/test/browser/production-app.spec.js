const { test, expect } = require("@playwright/test");

async function mockAnonymousSession(page, state = { authenticated: false, username: "alice_prod" }) {
  await page.route("**/auth/session", async route => {
    if (state.authenticated) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, username: state.username }) });
    } else {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "auth required" }) });
    }
  });
}

async function mockPinnedCryptoIdentity(page) {
  await page.route("**/crypto/v4/bootstrap*", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      protocol: "mls-1.0",
      domain: "production.test.invalid",
      identity: { cryptoUserId: "00000000-0000-4000-8000-000000000001", rootPublicKey: "pinned-root" },
      device: null,
      recovery: { serverEscrow: false }
    })
  }));
}

test("refresh performs a quiet anonymous session check and never trusts localStorage username", async ({ page }) => {
  const state = { authenticated: false, username: "stale-user" };
  let cryptoRequests = 0;
  await mockAnonymousSession(page, state);
  await page.route("**/crypto/v4/**", route => { cryptoRequests += 1; return route.abort(); });
  await page.goto("/");
  await expect(page.locator(".secure-transition")).toBeVisible();
  await expect(page.locator(".login-page")).toBeVisible();
  await expect(page.locator(".secure-transition")).toBeHidden();
  await page.evaluate(() => localStorage.setItem("username", "stale-user"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".secure-transition")).toBeVisible();
  await expect(page.locator(".login-page")).toBeVisible();
  await expect(page.locator(".crypto-gate")).toHaveCount(0);
  expect(cryptoRequests).toBe(0);
});

test("restored cookie session transitions to CryptoGate without exposing Messenger", async ({ page }) => {
  await mockAnonymousSession(page, { authenticated: true, username: "restored-user" });
  await mockPinnedCryptoIdentity(page);
  await page.goto("/");
  await expect(page.locator(".secure-transition")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Восстановление защищённого устройства" })).toBeVisible();
  await expect(page.locator(".secure-transition")).toBeHidden();
  await expect(page.locator(".app")).toHaveCount(0);
});

test("successful login is server-confirmed before CryptoGate starts", async ({ page }) => {
  const state = { authenticated: false, username: "login-user" };
  await mockAnonymousSession(page, state);
  await mockPinnedCryptoIdentity(page);
  await page.route("**/login/code", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sent: true, maskedEmail: "l***@example.test" })
  }));
  await page.route(/\/login$/, async route => {
    state.authenticated = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, username: state.username }) });
  });
  await page.goto("/");
  await expect(page.locator(".login-page")).toBeVisible();
  await page.locator('input[type="email"]').fill("login@example.test");
  await page.locator('input[type="password"]').fill("password-123");
  await page.locator(".auth-primary").click();
  await page.locator('input[inputmode="numeric"]').fill("12345678");
  await page.locator(".auth-primary").click();
  await expect(page.locator(".secure-transition")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Восстановление защищённого устройства" })).toBeVisible();
  await expect(page.locator(".app")).toHaveCount(0);
});

test("successful registration uses the same confirmed-session transition", async ({ page }) => {
  const state = { authenticated: false, username: "register-user" };
  await mockAnonymousSession(page, state);
  await mockPinnedCryptoIdentity(page);
  await page.route("**/auth/email-code", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sent: false, devCode: "12345678", maskedEmail: "r***@example.test" })
  }));
  await page.route("**/auth/verify-code", route => route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
  await page.route("**/register", async route => {
    state.authenticated = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, username: state.username }) });
  });
  await page.goto("/");
  await page.locator(".auth-link").first().click();
  await page.locator('input[type="email"]').fill("register@example.test");
  await page.locator(".auth-primary").click();
  await page.locator(".auth-primary").click();
  await page.locator(".auth-choice-button").nth(1).click();
  await page.locator(".auth-primary").click();
  await page.locator('input[placeholder="Username"]').fill(state.username);
  await page.locator('input[type="password"]').nth(0).fill("password-123");
  await page.locator('input[type="password"]').nth(1).fill("password-123");
  await page.locator(".auth-primary").click();
  await expect(page.locator(".secure-transition")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Восстановление защищённого устройства" })).toBeVisible();
  await expect(page.locator(".app")).toHaveCount(0);
});

test("transition gate covers login, registration and logout phases with accessible status", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountTransitionHarness());
  await expect(page.locator(".secure-transition")).toBeHidden();
  for (const action of ["login", "register"]) {
    await page.locator(`[data-action="${action}"]`).click();
    await expect(page.locator(".secure-transition")).toBeVisible();
    await expect(page.locator(".secure-transition [role=status]")).toBeVisible();
    await expect(page.locator(".secure-transition")).toBeHidden();
  }
  await page.locator('[data-action="logout"]').click();
  await expect(page.getByRole("heading", { name: "Закрываем защищённую сессию" })).toBeVisible();
  await expect(page.locator(".secure-transition")).toBeHidden();
});

test("CryptoGate blocks Messenger on storage failure and offers explicit reprovision", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountFailingCryptoGate());
  await expect(page.getByRole("heading", { name: "Защищённое хранилище недоступно" })).toBeVisible();
  await expect(page.locator("#messenger-sentinel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Восстановить это устройство" })).toBeVisible();
  await expect(page.getByRole("button", { name: /перезагруз/i })).toHaveCount(0);
  await expect(page.locator(".crypto-gate")).not.toContainText("technical detail");
});
