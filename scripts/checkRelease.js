#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const yauzl = require("yauzl");
const { resolveSourceRevision } = require("./sourceRevision");

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

async function listZipEntries(fd) {
  const zipFile = await yauzl.fromFdPromise(fd, { autoClose: false });
  const entries = [];
  let manifest = null;

  for await (const entry of zipFile.eachEntry()) {
    entries.push(entry.fileName);
    if (entry.fileName === "Liotan/RELEASE-MANIFEST.json") {
      const stream = await zipFile.openReadStreamPromise(entry);
      const chunks = [];
      let bytes = 0;
      for await (const chunk of stream) {
        bytes += chunk.length;
        if (bytes > 16 * 1024) throw new Error("Release manifest is unexpectedly large");
        chunks.push(chunk);
      }
      manifest = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
  }

  return { entries, manifest };
}

async function testZip() {
  console.log("\n==> ZIP exists and has non-empty payload");
  let fd;
  let checksumFd;
  try {
    fd = fs.openSync(releaseZip, "r");
    const size = fs.fstatSync(fd).size;
    if (size < 1024) throw new Error("Release ZIP is unexpectedly small");
    const signature = Buffer.alloc(4);
    if (fs.readSync(fd, signature, 0, signature.length, 0) !== signature.length ||
      signature[0] !== 0x50 || signature[1] !== 0x4b) {
      throw new Error("Release file does not look like a ZIP archive");
    }
    checksumFd = fs.openSync(checksumFile, "r");
    const expected = fs.readFileSync(checksumFd, "utf8").trim().split(/\s+/)[0].toUpperCase();
    const hash = require("crypto").createHash("sha256");
    const block = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < size) {
      const bytesRead = fs.readSync(fd, block, 0, Math.min(block.length, size - position), position);
      if (bytesRead <= 0) throw new Error("Release ZIP changed while it was being verified");
      hash.update(block.subarray(0, bytesRead));
      position += bytesRead;
    }
    if (expected !== hash.digest("hex").toUpperCase()) {
      throw new Error("Release checksum does not match ZIP contents");
    }
    const { entries, manifest } = await listZipEntries(fd);
    const forbidden = entries.filter(entry => /(^|\/)(node_modules|\.git|build|dist|coverage|test-results|playwright-report)(\/|$)|(^|\/)\.env(?:\.|$)|\.zip$/i.test(entry));
    if (forbidden.length) {
      throw new Error(`Forbidden release entries: ${forbidden.slice(0, 10).join(", ")}`);
    }
    if (manifest?.schema !== "liotan-clean-release/v1" ||
      manifest.version !== String(rootPackage.version) ||
      manifest.sourceSha !== resolveSourceRevision(root)) {
      throw new Error("Release manifest is absent or does not bind this exact source revision");
    }
  } finally {
    if (checksumFd !== undefined) fs.closeSync(checksumFd);
    if (fd !== undefined) fs.closeSync(fd);
  }
}

async function main() {
  runNpm("executable architecture map", ["run", "audit:architecture"]);
  runNpm("production import graph and dead-code gate", ["run", "audit:code-health"]);
  runNpm("workflow permission and provenance gate", ["run", "audit:workflows"]);
  runNpm("CSS architecture and reproducibility gates", ["run", "audit:css"]);
  runNpm("reproducible CSS production build", ["run", "test:css-reproducible"]);
  runNpm("client build", ["run", "check:client"]);
  runNpm("server syntax check", ["run", "check:server"]);
  runNpm("unit, integration, browser, and coverage tests", ["test"]);
  runNpm("license policy and CycloneDX SBOM", ["run", "supply-chain"]);
  runNpm("reproducible CycloneDX SBOM", ["run", "test:sbom-reproducible"]);
  runNpm("root dependency audit", ["audit"]);
  runNpm("client production audit", ["audit", "--omit=dev"], path.join(root, "client"));
  runNpm("server production audit", ["audit", "--omit=dev"], path.join(root, "server"));
  runNpm("privacy audit", ["run", "audit:privacy"]);
  runNpm("encrypted reply privacy audit", ["run", "audit:e2ee-replies"]);
  runNpm("VPS hardening configuration audit", ["run", "audit:vps"]);
  runNpm("reproducible clean release", ["run", "test:release-reproducible"]);
  await testZip();
  console.log("\nRelease check passed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
