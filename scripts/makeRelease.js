#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const version = String(rootPackage.version || "dev");
const outDir = path.join(root, "release");
const outFile = path.join(outDir, `Liotan-${version}-clean.zip`);
const tmpDir = path.join(os.tmpdir(), `liotan-release-${process.pid}-${Date.now()}`);
const stagedRoot = path.join(tmpDir, "Liotan");

const EXCLUDED_NAMES = new Set([
  ".git",
  "node_modules",
  ".env",
  "dist",
  "build",
  "release",
  "README.md"
]);

const EXCLUDED_RELATIVE = new Set([
  "client/README.md",
  "server/.env",
  "server/.evn.exapmle"
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function shouldExclude(fullPath) {
  const rel = toPosix(path.relative(root, fullPath));
  const base = path.basename(fullPath);

  if (!rel) return false;
  if (EXCLUDED_NAMES.has(base)) return true;
  if (EXCLUDED_RELATIVE.has(rel)) return true;
  if (rel.endsWith("/.env") || rel.includes("/.git/") || rel.includes("/node_modules/")) return true;
  if (rel.includes("/build/") || rel.includes("/dist/")) return true;
  return false;
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    if (shouldExclude(sourcePath)) continue;

    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function commandExists(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [command] : ["-v", command], {
    shell: process.platform !== "win32",
    stdio: "ignore"
  });
  return result.status === 0;
}

function zipWithArchiver() {
  let archiver;
  try {
    archiver = require("archiver");
  } catch {
    return false;
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(stagedRoot, "Liotan");
    archive.finalize();
  });
}

function zipWithSystemZip() {
  if (!commandExists("zip")) {
    return false;
  }

  const result = spawnSync("zip", ["-qr", outFile, "Liotan"], {
    cwd: tmpDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("zip command failed");
  }

  return true;
}

function zipWithPowerShell() {
  if (process.platform !== "win32") {
    return false;
  }

  const command = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    `Compress-Archive -Path '${stagedRoot.replace(/'/g, "''")}' -DestinationPath '${outFile.replace(/'/g, "''")}' -Force`
  ];

  const result = spawnSync("powershell.exe", command, { stdio: "inherit" });

  if (result.status !== 0) {
    throw new Error("PowerShell Compress-Archive failed");
  }

  return true;
}

async function createZip() {
  const archiverResult = zipWithArchiver();
  if (archiverResult) {
    await archiverResult;
    return;
  }

  if (zipWithSystemZip()) {
    return;
  }

  if (zipWithPowerShell()) {
    return;
  }

  throw new Error("No ZIP backend available. Install root dev dependencies or use a system with zip/PowerShell.");
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  copyDirectory(root, stagedRoot);
  await createZip();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`Release archive created: ${outFile}`);
  console.log(`Size: ${sizeMb} MB`);
  console.log("Excluded: .env, .git, node_modules, build, dist, release, README.md");
}

main().catch(err => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  console.error(err);
  process.exit(1);
});
