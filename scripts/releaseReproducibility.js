#!/usr/bin/env node
"use strict";

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const version = String(require(path.join(root, "package.json")).version);
const archive = path.join(root, "release", `Liotan-${version}-clean.zip`);

function buildAndHash() {
  execFileSync(process.execPath, [path.join(__dirname, "makeRelease.js")], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false
  });
  return crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
}

const first = buildAndHash();
const second = buildAndHash();
assert.strictEqual(second, first, "clean release ZIP generation must be byte-reproducible");
console.log(`Clean release ZIP is reproducible: ${first}`);
