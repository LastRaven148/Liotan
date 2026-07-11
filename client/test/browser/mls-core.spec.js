const { test, expect } = require("@playwright/test");

test("CoreCrypto performs two-device MLS add, messaging, update, tamper and replay checks", async ({ page }) => {
  await page.goto("/test/browser/fixture.html");
  await expect(page.locator("#status")).toHaveText("fixture-loaded");
  const result = await page.evaluate(() => window.runMlsInterop());
  expect(result).toEqual({
    ok: true,
    epoch: 2,
    rosterSize: 2,
    tamperRejected: true,
    replayRejected: true
  });
});
