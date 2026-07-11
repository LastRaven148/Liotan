#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const releaseZip = path.join(root, "release", `Liotan-${rootPackage.version}-clean.zip`);
const checksumFile = `${releaseZip}.sha256`;
const npmCli = process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  : null;

function runNpm(label, args, cwd = root) {
  console.log(`\n==> ${label}`);
  execFileSync(npmCli ? process.execPath : "npm", npmCli ? [npmCli, ...args] : args, {
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
  if (!fs.existsSync(checksumFile)) {
    throw new Error("Release checksum was not created");
  }
  const expected = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0].toUpperCase();
  const actual = require("crypto").createHash("sha256").update(fs.readFileSync(releaseZip)).digest("hex").toUpperCase();
  if (expected !== actual) {
    throw new Error("Release checksum does not match ZIP contents");
  }
  const entries = execFileSync("tar", ["-tf", releaseZip], { encoding: "utf8", shell: false })
    .split(/\r?\n/).filter(Boolean);
  const forbidden = entries.filter(entry => /(^|\/)(node_modules|\.git|build|dist|coverage|test-results|playwright-report)(\/|$)|(^|\/)\.env(?:\.|$)|\.zip$/i.test(entry));
  if (forbidden.length) {
    throw new Error(`Forbidden release entries: ${forbidden.slice(0, 10).join(", ")}`);
  }
}

function main() {
  runNpm("client build", ["run", "check:client"]);
  runNpm("server syntax check", ["run", "check:server"]);
  runNpm("unit, integration, browser, and coverage tests", ["test"]);
  runNpm("license policy and CycloneDX SBOM", ["run", "supply-chain"]);
  runNpm("root dependency audit", ["audit"]);
  runNpm("client production audit", ["audit", "--omit=dev"], path.join(root, "client"));
  runNpm("server production audit", ["audit", "--omit=dev"], path.join(root, "server"));
  runNpm("privacy audit", ["run", "audit:privacy"]);
  runNpm("encrypted reply privacy audit", ["run", "audit:e2ee-replies"]);
  runNpm("VPS hardening configuration audit", ["run", "audit:vps"]);
  runNpm("make clean release", ["run", "make-release"]);
  testZip();
  console.log("\nRelease check passed.");
}

main();
