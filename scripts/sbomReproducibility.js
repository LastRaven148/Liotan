#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const generator = path.join(__dirname, "generateSbom.js");
const files = ["root", "client", "server"]
  .map(name => path.join(root, "artifacts", "sbom", `${name}.cdx.json`));

function generate() {
  execFileSync(process.execPath, [generator], { cwd: root, stdio: "inherit", shell: false });
  return Object.fromEntries(files.map(file => [
    path.basename(file),
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  ]));
}

const first = generate();
const second = generate();
if (JSON.stringify(first) !== JSON.stringify(second)) {
  throw new Error(`SBOM generation is not reproducible: ${JSON.stringify({ first, second })}`);
}
console.log(`SBOM generation is reproducible: ${JSON.stringify(first)}`);
