const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { installProductionApiGuard } = require("./production-network-guard");

installProductionApiGuard(test);

test("application cold start initializes WASM before creating its MLS ClientId", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  const result = await page.evaluate(() => window.runColdStartClientIdentityProbe());
  expect(result).toEqual({
    ok: true,
    clientId: "00000000-0000-4000-8000-000000000009:0000000000000009@browser.test.invalid",
    matches: true
  });
});

test("recovery key survives concurrent save and full reload in browser IndexedDB", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  const probe = await page.evaluate(async () => {
    const username = `recovery-${crypto.randomUUID()}`;
    const key = window.createProductionRecoveryKey();
    await Promise.all([
      window.saveProductionRecoveryKey(username, key),
      window.saveProductionRecoveryKey(username, key)
    ]);
    return { username, key };
  });
  await page.reload();
  await expect(page.locator("#status")).toHaveText("production-fixture-loaded");
  expect(await page.evaluate(username => window.loadProductionRecoveryKey(username), probe.username)).toBe(probe.key);
});

test("passphrase recovery wrapping rejects raw dumps, wrong secrets and resumes interrupted migration", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  expect(await page.evaluate(() => window.runRecoveryProtectionProbe())).toEqual({
    protected: true,
    presenceRequired: true,
    wrongRejected: true,
    concurrentUnlock: true,
    dumpContainsRecoveryKey: false,
    resumed: true,
    disabled: true
  });
});

test("encrypted local history supports bounded cursor paging in production IndexedDB", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  const result = await page.evaluate(() => window.runEncryptedHistoryPagingProbe());
  expect(result).toEqual({
    latest: [4, 5],
    older: [2, 3],
    newer: [3, 4],
    exact: 4
  });
});

test("production MLS envelope accepts every authenticated adaptive media chunk size", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  expect(await page.evaluate(() => window.runAdaptiveMediaDescriptorProbe())).toEqual([
    256 * 1024,
    512 * 1024,
    1024 * 1024
  ]);
});

test("100 MB media encryption stays chunked and removes its OPFS temporary file", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  const result = await page.evaluate(() => window.runLargeMediaEncryptionProbe());
  expect(result.originalBytes).toBe(100 * 1024 * 1024);
  expect(result.ciphertextBytes).toBe(result.uploadedBytes);
  expect(result.ciphertextBytes).toBeLessThanOrEqual(102 * 1024 * 1024);
  expect(result.chunks).toBe(100);
  expect(result.progress).toEqual(["encrypting", "uploading"]);
  expect(result.opfsTemporaryFiles).toBe(0);
});

test("aborted encrypted media upload fails closed and cleans temporary OPFS state", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  expect(await page.evaluate(() => window.runAbortedMediaCleanupProbe())).toEqual({
    rejected: true,
    opfsTemporaryFiles: 0
  });
});

test("encrypted trust state rejects a signed device-directory rollback while clean clients remain first-seen", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  expect(await page.evaluate(() => window.runDirectoryRollbackProbe())).toEqual({
    rollbackRejected: true,
    chainTamperRejected: true,
    cleanStatus: "first-seen",
    cleanFirstContact: true,
    boundedTailAccepted: true,
    latestVersion: 2
  });
});

test("production cursor repair ignores localStorage drift and rejects reordered or rolled-back pages", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  expect(await page.evaluate(() => window.runSyncCursorRepairProbe())).toEqual({
    deletedAfter: 5,
    aheadAfter: 5,
    behindAfter: 5,
    repairedAhead: true,
    validPageHead: 9,
    reorderRejected: true,
    rollbackRejected: true
  });
});

test("safety number is symmetric and changes with the signed device directory", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  expect(await page.evaluate(() => window.runSafetyNumberProbe())).toEqual({
    sameAcrossSides: true,
    deviceChangeDetected: true,
    decimalGroups: 13,
    qrBound: true
  });
});

test("production IndexedDB migrates a thousand encrypted history records in bounded batches", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  const result = await page.evaluate(() => window.runLargeHistoryMigrationProbe());
  expect(result.completed).toBe(true);
  expect(result.written).toBe(1000);
  expect(result.latest).toEqual([998, 999, 1000]);
  expect(result.legacyRecords).toBe(0);
  expect(result.eventLoopTicks).toBeGreaterThan(5);
  expect(result.elapsedMs).toBeLessThan(90_000);
});

test("CoreCrypto performs two-device MLS add, messaging, update, tamper and replay checks", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  await expect(page.locator("#status")).toHaveText("production-fixture-loaded");
  const result = await page.evaluate(() => window.runMlsInterop());
  expect(result).toEqual({
    ok: true,
    epoch: 3,
    rosterSize: 1,
    tamperRejected: true,
    replayRejected: true,
    outOfOrderAccepted: true,
    pastEpochOneBackAccepted: true,
    pastEpochTwoBackAccepted: true,
    transactionRollbackPreservedEpoch: true,
    removedClientRejected: true
  });
});

test("production bundle opens and reopens persistent CoreCrypto IndexedDB after parallel WASM initialization", async ({ page }) => {
  await page.goto("/test/production/fixture.html");
  const wasmUrl = await page.evaluate(() => window.getProductionWasmUrl());
  const wasm = await page.request.get(wasmUrl);
  expect(wasm.ok()).toBeTruthy();
  expect(wasm.headers()["content-type"]).toContain("application/wasm");
  const publishedHash = crypto.createHash("sha256").update(await wasm.body()).digest("hex");
  const packageWasm = fs.readFileSync(path.resolve(
    __dirname,
    "../../node_modules/@wireapp/core-crypto/dist/browser/autogenerated/wasm-bindgen/index_bg.wasm"
  ));
  expect(publishedHash).toBe(crypto.createHash("sha256").update(packageWasm).digest("hex"));
  const result = await page.evaluate(() => window.runPersistentDatabaseProbe({ concurrentInit: true }));
  expect(result.ok).toBe(true);
  expect(result.memoryCoreCreated).toBe(true);
  expect(result.firstLocation).toBe(result.secondLocation);
  expect(await page.evaluate(() => window.getDatabaseRepairPolicy())).toEqual({
    unregisteredEarlyFailure: true,
    registeredEarlyFailure: false,
    unregisteredLateFailure: false
  });
  expect(await page.evaluate(() => window.getMlsMaintenancePolicy())).toEqual({
    selfUpdateHours: 72,
    maintenanceSeconds: 45
  });
});

test("production application bundle contains MLS v4 paths and no legacy private-key APIs", async ({ page }) => {
  const index = await page.request.get("/");
  expect(index.ok()).toBeTruthy();
  const html = await index.text();
  const chunks = [
    ...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.js)"/g)
  ].map(match => match[1]);
  expect(chunks.length).toBeGreaterThan(1);
  const pending = [...chunks];
  const visited = new Set();
  const sources = [];
  while (pending.length) {
    const source = pending.shift();
    if (visited.has(source)) continue;
    visited.add(source);
    const response = await page.request.get(source);
    expect(response.ok()).toBeTruthy();
    const javascript = await response.text();
    sources.push(javascript);
    for (const match of javascript.matchAll(/(?:from\s*|import\s*\()\s*["'](\.\/[^"']+\.js)["']/g)) {
      pending.push(new URL(match[1], new URL(source, "http://127.0.0.1:4174")).pathname);
    }
  }
  const bundle = sources.join("\n");
  expect(bundle).toContain("/crypto/v4/");
  expect(bundle).not.toMatch(/\/e2ee\/(?:identity(?:-backup)?|conversations\/[^"']+\/key)/);
});
