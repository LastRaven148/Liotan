const { test, expect } = require("@playwright/test");
const { installProductionApiGuard } = require("./production-network-guard");

installProductionApiGuard(test);

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

for (const kind of ["file", "video"]) {
  test(`attachment ${kind} preview stays inside the production viewport without a single-item scrollbar`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto("/test/production/fixture.html");
    await page.evaluate(value => window.mountAttachmentPreview(value), kind);
    const modal = page.locator(".attachment-preview-modal");
    const list = page.locator(".attachment-preview-list");
    await expect(modal).toBeVisible();
    const bounds = await modal.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(520);
    expect(bounds.height).toBeLessThanOrEqual(696);
    const overflow = await list.evaluate(element => ({
      x: element.scrollWidth > element.clientWidth,
      y: element.scrollHeight > element.clientHeight,
      overflowX: getComputedStyle(element).overflowX,
      overflowY: getComputedStyle(element).overflowY
    }));
    expect(overflow).toEqual({ x: false, y: false, overflowX: "hidden", overflowY: "hidden" });
    await expect(page.locator(".attachment-preview-file-remove svg, .attachment-preview-remove svg")).toBeVisible();
  });
}

test("other-user profile renders only the API-safe public fields", async ({ page }) => {
  await page.route("**/profile/Bob", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ username: "Bob", displayName: "Боб", avatar: "", bio: "Публичное описание", limited: false })
  }));
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountUserProfile({ type: "private", username: "Bob" }));
  await expect(page.locator(".profile-drawer-name")).toHaveText("Боб");
  await expect(page.locator(".profile-drawer")).toContainText("Публичное описание");
  await expect(page.locator(".profile-drawer")).not.toContainText(/email|password|recovery/i);
});

test("group profile refreshes by groupId even when it has no username", async ({ page }) => {
  await page.route("**/groups/group-1", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ _id: "group-1", name: "Обновлённая группа", members: ["Alice"], memberUsers: [], owner: "Alice", admins: ["Alice"] })
  }));
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountUserProfile({ type: "group", groupId: "group-1", title: "Старое имя" }));
  await expect(page.locator(".profile-drawer-name")).toHaveText("Обновлённая группа");
  await expect(page.locator(".profile-load-error")).toHaveCount(0);
});

test("chat security notice never claims E2EE readiness before MLS is ready", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountChatSecurityNotice(false));
  await expect(page.locator(".chat-security-notice")).toContainText("подготавливается");
  await expect(page.locator(".chat-security-notice")).not.toContainText("защищены сквозным");
  await page.evaluate(() => window.mountChatSecurityNotice(true));
  await expect(page.locator(".chat-security-notice")).toContainText("защищены сквозным шифрованием");
  await expect(page.locator(".chat-e2ee-button")).toHaveCount(0);
});

test("safety number UI renders a bound QR and requires an explicit comparison", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountSafetyNumber());
  await expect(page.getByRole("dialog", { name: "Проверка защищённости" })).toBeVisible();
  await expect(page.locator(".safety-status")).toContainText("получены впервые");
  await expect(page.locator(".safety-qr")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.locator(".safety-scan-field input").fill("liotan-safety:v2:wrong");
  await page.getByRole("button", { name: "Сравнить код" }).click();
  await expect(page.getByRole("alert")).toContainText("не совпадает");
  await expect(page.locator("#safety-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Я сравнил цифры" }).click();
  await expect(page.locator("#safety-result")).toHaveText("verified");
});

test("device security UI approves pending devices, confirms revoke and protects local recovery", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountCryptoDevices());
  await expect(page.getByText("Устройства и ключи")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByRole("status")).toContainText("Устройство подтверждено");
  const thirdDevice = page.locator(".settings-crypto-device-row").filter({ hasText: "00000…0003" });
  await thirdDevice.getByRole("button", { name: "Отозвать" }).click();
  await expect(thirdDevice.getByRole("button", { name: "Точно отозвать" })).toBeVisible();
  await thirdDevice.getByRole("button", { name: "Точно отозвать" }).click();
  await expect(page.getByRole("status")).toContainText("Сессия отозвана");
  await page.getByRole("button", { name: "Включить" }).click();
  await page.locator('.settings-recovery-form input[type="password"]').nth(0).fill("fixture-passphrase-strong");
  await page.locator('.settings-recovery-form input[type="password"]').nth(1).fill("fixture-passphrase-strong");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Включено")).toBeVisible();
});

test("settings uses the unified gear icon instead of the old sunburst", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountSettingsIcon());
  const icon = page.getByRole("img", { name: "Настройки" });
  await expect(icon).toBeVisible();
  await expect(icon.locator("path")).toHaveCount(1);
  await expect(icon.locator("circle")).toHaveCount(1);
});
