"use strict";

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./client/test/browser",
  outputDir: "./test-results/playwright",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } }
  ],
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serveProductionBrowserTests.js",
    url: "http://127.0.0.1:4174/test/production/fixture.html",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
