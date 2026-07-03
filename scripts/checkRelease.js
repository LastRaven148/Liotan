#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const releaseZip = path.join(root, "release", `Liotan-${rootPackage.version}-clean.zip`);

function runNpm(label, args, cwd = root) {
  console.log(`\n==> ${label}`);
  execFileSync("npm", args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: false
  });
}

function testZip() {
  if (!fs.existsSync(releaseZip)) {
    throw new Error(`Release ZIP was not created: ${releaseZip}`);
  }

  console.log("\n==> ZIP exists and has non-empty payload");
  const size = fs.statSync(releaseZip).size;
  if (size < 1024) {
    throw new Error("Release ZIP is unexpectedly small");
  }
  const signature = fs.readFileSync(releaseZip, { encoding: null, flag: "r" }).subarray(0, 4);
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error("Release file does not look like a ZIP archive");
  }
}

function main() {
  runNpm("client build", ["run", "check:client"]);
  runNpm("server syntax check", ["run", "check:server"]);
  runNpm("client production audit", ["audit", "--omit=dev"], path.join(root, "client"));
  runNpm("server production audit", ["audit", "--omit=dev"], path.join(root, "server"));
  runNpm("privacy audit", ["run", "audit:privacy"]);
  runNpm("make clean release", ["run", "make-release"]);
  testZip();
  console.log("\nRelease check passed.");
}

main();
