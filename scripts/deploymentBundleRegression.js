#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const build = path.join(root, "client", "build");
const index = path.join(build, "index.html");
const fixture = path.join(build, "test", "production", "fixture.html");
const assets = path.join(build, "assets");

assert(fs.existsSync(index), "normal client/build/index.html must exist before deployment packaging");
assert(!fs.existsSync(fixture), "Playwright production fixture must never enter client/build");

const testChunks = fs.existsSync(assets)
  ? fs.readdirSync(assets).filter(name => /^productionCrypto-.*\.js$/.test(name))
  : [];
assert.deepStrictEqual(testChunks, [], "Playwright productionCrypto chunks must never enter client/build");

console.log("Deployment bundle isolation checks passed.");
