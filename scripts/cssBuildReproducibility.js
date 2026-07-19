#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const client = path.join(root, "client");
const npmCli = process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  : null;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "liotan-css-repro-"));

function build(outDir) {
  const npmArgs = ["run", "build", "--", "--outDir", outDir, "--emptyOutDir"];
  execFileSync(npmCli ? process.execPath : "npm", npmCli ? [npmCli, ...npmArgs] : npmArgs, {
    cwd: client,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, SOURCE_DATE_EPOCH: "0" }
  });
}

function cssArtifacts(directory) {
  const assets = path.join(directory, "assets");
  const files = fs.existsSync(assets) ? fs.readdirSync(assets).filter(name => name.endsWith(".css")).sort() : [];
  if (files.length !== 1) throw new Error(`Expected one reachable production CSS chunk, found ${files.length}`);
  return files.map(name => ({
    logicalName: name.replace(/-[A-Za-z0-9_-]+\.css$/, ".css"),
    hash: crypto.createHash("sha256").update(fs.readFileSync(path.join(assets, name))).digest("hex")
  }));
}

try {
  const first = path.join(tempRoot, "first");
  const second = path.join(tempRoot, "second");
  build(first);
  build(second);
  const a = cssArtifacts(first);
  const b = cssArtifacts(second);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Production CSS differs across identical builds");
  console.log(`CSS production build is reproducible: ${a[0].hash}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
