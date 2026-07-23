#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveSourceRevision } = require("./sourceRevision");

const root = path.resolve(__dirname, "..");
const build = path.join(root, "client", "build");
const index = path.join(build, "index.html");
const fixture = path.join(build, "test", "production", "fixture.html");
const assets = path.join(build, "assets");
const buildMetaFile = path.join(build, "build-meta.json");
const ciWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");

assert(fs.existsSync(index), "normal client/build/index.html must exist before deployment packaging");
assert(!fs.existsSync(fixture), "Playwright production fixture must never enter client/build");
assert(fs.existsSync(buildMetaFile), "client build provenance manifest must be present");
const buildMeta = JSON.parse(fs.readFileSync(buildMetaFile, "utf8"));
assert.strictEqual(buildMeta.schema, "liotan-client-build/v1");
assert.strictEqual(buildMeta.sourceSha, resolveSourceRevision(root),
  "client build provenance must bind the exact checked-out source revision");
assert.deepStrictEqual(
  fs.readdirSync(build, { recursive: true }).filter(name => String(name).endsWith(".map")),
  [],
  "production client build must not publish source maps"
);

const testChunks = fs.existsSync(assets)
  ? fs.readdirSync(assets).filter(name => /^productionCrypto-.*\.js$/.test(name))
  : [];
assert.deepStrictEqual(testChunks, [], "Playwright productionCrypto chunks must never enter client/build");
assert.match(ciWorkflow, /tar --sort=name --mtime='UTC 2000-01-01' --owner=0 --group=0 --numeric-owner/,
  "deployment tar metadata and entry order must be normalized");
assert.match(ciWorkflow, /build_bundle "\$FIRST_BUNDLE"[\s\S]*build_bundle "\$BUNDLE"[\s\S]*cmp --silent/,
  "CI must compare two independently generated deployment bundles");
assert.match(ciWorkflow, /DEPLOYMENT-MANIFEST\.json/,
  "deployment bundle must contain an exact source revision manifest");

console.log("Deployment bundle isolation and reproducibility checks passed.");
