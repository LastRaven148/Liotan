"use strict";

const { test, expect } = require("@playwright/test");
const { installProductionApiGuard } = require("./production-network-guard");

installProductionApiGuard(test);

const API = "**/__liotan_test_api__";

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function mockSettingsBootstrap(page) {
  await page.route(`${API}/auth/sessions`, route => json(route, { sessions: [] }));
  await page.route(`${API}/security/status`, route => json(route, {
    security: { totp: { enabled: false }, support: { supportCanGrantAccess: false, supportCanReset2FA: false, supportCanViewSecrets: false } },
    restrictedSession: { restricted: false }
  }));
}

test("blocklist renders and paginates more than one hundred account-scoped records", async ({ page }) => {
  const blocks = Array.from({ length: 106 }, (_, index) => ({
    username: `blocked_${String(index + 1).padStart(3, "0")}`,
    displayName: `Blocked profile ${index + 1}`,
    avatar: "",
    blockedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
  }));
  await page.route(`${API}/me/blocks**`, async route => {
    const request = route.request();
    if (request.method() === "DELETE") {
      const username = decodeURIComponent(new URL(request.url()).pathname.split("/").at(-1));
      const index = blocks.findIndex(item => item.username === username);
      if (index >= 0) blocks.splice(index, 1);
      return json(route, { ok: true });
    }
    const cursor = Number(new URL(request.url()).searchParams.get("cursor") || 0);
    const pageItems = blocks.slice(cursor, cursor + 50);
    const next = cursor + pageItems.length;
    return json(route, {
      blocks: pageItems,
      hasMore: next < blocks.length,
      nextCursor: next < blocks.length ? String(next) : ""
    });
  });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountBlocklist());
  await expect(page.locator(".settings-blocklist-row")).toHaveCount(50);
  await page.locator(".settings-support-button").click();
  await expect(page.locator(".settings-blocklist-row")).toHaveCount(100);
  await page.locator(".settings-support-button").click();
  await expect(page.locator(".settings-blocklist-row")).toHaveCount(106);
  const first = page.locator(".settings-blocklist-row").first();
  await first.locator("button").click();
  await expect(page.locator(".settings-blocklist-row")).toHaveCount(105);
  const geometry = await page.getByRole("dialog", { name: "Blocked users" }).evaluate(element => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.width).toBeLessThanOrEqual(320);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test("notification settings synchronize between two independent browser profiles", async ({ browser, page }) => {
  let state = {
    version: 1,
    desktopEnabled: true,
    soundEnabled: true,
    sentSoundEnabled: true,
    receivedSoundEnabled: true,
    privateChatsEnabled: true,
    groupsEnabled: true,
    volume: 50,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  async function install(profilePage) {
    await profilePage.route(`${API}/me/notification-settings`, async route => {
      if (route.request().method() === "GET") return json(route, state);
      const body = route.request().postDataJSON();
      if (body.expectedVersion !== state.version) return json(route, { error: "settings version conflict", current: state }, 409);
      state = { ...state, ...body.settings, version: state.version + 1, updatedAt: new Date().toISOString() };
      return json(route, state);
    });
  }
  try {
    await Promise.all([install(page), install(second)]);
    await Promise.all([
      page.goto("/test/production/fixture.html"),
      second.goto("/test/production/fixture.html")
    ]);
    await Promise.all([
      page.evaluate(() => window.mountNotifications()),
      second.evaluate(() => window.mountNotifications())
    ]);
    const firstGroups = page.getByRole("checkbox", { name: "Groups" });
    const secondGroups = second.getByRole("checkbox", { name: "Groups" });
    await expect(firstGroups).toBeChecked();
    await expect(secondGroups).toBeChecked();
    await page.locator(".settings-check-row").filter({ hasText: "Groups" }).click();
    await expect.poll(() => state.groupsEnabled).toBe(false);
    await second.evaluate(() => window.dispatchEvent(new CustomEvent("liotan:account-state-invalidated", { detail: { kind: "notification-settings-updated" } })));
    await expect(secondGroups).not.toBeChecked();
    expect(state.version).toBe(2);

    state = { ...state, version: 3, privateChatsEnabled: true, updatedAt: new Date().toISOString() };
    const privateChats = page.getByRole("checkbox", { name: "Private chats" });
    await expect(privateChats).toBeChecked();
    await page.locator(".settings-check-row").filter({ hasText: "Private chats" }).click();
    await expect(privateChats).toBeChecked();
    await expect(page.getByRole("alert")).toContainText(/version conflict/i);
  } finally {
    await secondContext.close();
  }
});

test("visual and accessibility contracts cover responsive panels and irreversible dialogs", async ({ page }) => {
  await mockSettingsBootstrap(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/test/production/fixture.html");
  await page.evaluate(() => window.mountResponsiveLayout({ mobile: true, activeChat: true, profile: true }));
  const panelContract = await page.locator(".app").evaluate(element => {
    const children = [...element.children].map(child => {
      const rect = child.getBoundingClientRect();
      const style = getComputedStyle(child);
      const rawDuration = style.transitionDuration;
      const transitionSeconds = rawDuration.endsWith("ms") ? Number.parseFloat(rawDuration) / 1000 : Number.parseFloat(rawDuration);
      return { width: rect.width, height: rect.height, transitionSeconds };
    });
    return { width: element.getBoundingClientRect().width, scrollWidth: document.documentElement.scrollWidth, children };
  });
  expect(panelContract).toEqual({
    width: 320,
    scrollWidth: 320,
    children: [
      { width: 320, height: 568, transitionSeconds: 0.00001 },
      { width: 320, height: 568, transitionSeconds: 0.00001 },
      { width: 320, height: 568, transitionSeconds: 0.00001 }
    ]
  });

  await page.evaluate(() => window.mountDialogDeletion({ group: false, language: "ru" }));
  await page.locator(".user").click({ button: "right" });
  await page.locator(".dialog-context-menu .danger").click();
  const modal = page.locator(".dialog-delete-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(/безвозвратно/);
  const modalContract = await modal.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: rect.width,
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor
    };
  });
  expect(modalContract).toEqual({ width: 272, insideViewport: true, borderRadius: "18px", backgroundColor: "rgb(31, 31, 31)" });
  const screenshot = await page.locator(".dialog-delete-modal-overlay").screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(5000);

  await expect(page.locator(".dialog-delete-modal-cancel")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".dialog-delete-modal-danger")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".dialog-delete-modal-cancel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  await page.evaluate(() => window.mountDialogDeletion({ group: true, language: "en", pending: true }));
  await page.locator(".user").click({ button: "right" });
  await page.locator(".dialog-context-menu .danger").click();
  await expect(page.locator(".dialog-delete-modal")).toContainText(/long encrypted research group/i);
  await page.locator(".dialog-delete-modal-danger").click();
  await expect(page.locator(".dialog-delete-modal-danger")).toBeDisabled();
  await expect(page.locator(".dialog-delete-modal")).toContainText("Deletion in progress");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dialog-delete-modal")).toBeVisible();
  await page.evaluate(() => window.__finishFixtureDeletion());
  await expect(page.locator(".dialog-delete-modal")).toBeHidden();
});
