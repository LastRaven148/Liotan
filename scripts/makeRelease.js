#!/usr/bin/env node
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createArchive } = require("./archiveFactory");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const version = String(rootPackage.version || "dev");
const outDir = path.join(root, "release");
const outFile = path.join(outDir, `Liotan-${version}-clean.zip`);
const checksumFile = `${outFile}.sha256`;
const tmpDir = path.join(os.tmpdir(), `liotan-release-${process.pid}-${Date.now()}`);
const stagedRoot = path.join(tmpDir, "Liotan");
const rootReal = fs.realpathSync.native(root);
const ARCHIVE_DATE = new Date("2000-01-01T00:00:00.000Z");

const EXCLUDED_NAMES = new Set([
  ".git",
  "node_modules",
  ".env",
  "dist",
  "build",
  "release",
  "README.md",
  "coverage",
  "test-results",
  "playwright-report",
  ".cache",
  "cache",
  ".DS_Store",
  "Thumbs.db"
]);

const EXCLUDED_RELATIVE = new Set([
  "client/README.md",
  "server/.env",
  "server/.evn.exapmle"
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function assertEntryName(name) {
  if (typeof name !== "string" || !name || name.includes("/") || name.includes("\\")) {
    throw new Error("Unsafe filesystem entry name in release source");
  }
}

function childPath(parent, name) {
  assertEntryName(name);
  const prefix = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
  return `${prefix}${name}`;
}

function sourceChildPath(parent, name) {
  const candidate = childPath(parent, name);
  const real = fs.realpathSync.native(candidate);
  const relative = path.relative(rootReal, real);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to copy a path outside the expected release tree");
  }
  return real;
}

function shouldExclude(fullPath) {
  const rel = toPosix(path.relative(rootReal, fs.realpathSync.native(fullPath)));
  const base = path.basename(fullPath);

  if (!rel) return false;
  if (EXCLUDED_NAMES.has(base)) return true;
  if (EXCLUDED_RELATIVE.has(rel)) return true;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (base.endsWith(".log") || base.endsWith(".zip")) return true;
  if (rel.endsWith("/.env") || rel.includes("/.git/") || rel.includes("/node_modules/")) return true;
  if (rel.includes("/build/") || rel.includes("/dist/") || rel.includes("/coverage/")) return true;
  return false;
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));

  for (const entry of entries) {
    const sourcePath = sourceChildPath(source, entry.name);
    if (shouldExclude(sourcePath)) continue;

    const destinationPath = childPath(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function releaseFiles(directory, prefix = "Liotan") {
  const files = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const fullPath = childPath(directory, entry.name);
    const archivePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...releaseFiles(fullPath, archivePath));
    else if (entry.isFile()) files.push({ fullPath, archivePath });
  }
  return files;
}

async function zipWithArchiver() {
  let archiverModule;
  try {
    archiverModule = await import("archiver");
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND" && error?.code !== "MODULE_NOT_FOUND") throw error;
    return false;
  }

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = createArchive(archiverModule, "zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    for (const file of releaseFiles(stagedRoot)) {
      archive.append(fs.readFileSync(file.fullPath), {
        name: file.archivePath,
        date: ARCHIVE_DATE,
        mode: 0o644
      });
    }
    archive.finalize();
  });
  return true;
}

function zipWithSystemZip() {
  try {
    execFileSync("zip", ["-qr", outFile, "Liotan"], {
      cwd: tmpDir,
      stdio: "inherit",
      shell: false
    });
    return true;
  } catch {
    return false;
  }
}

function zipWithPowerShell() {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    execFileSync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${stagedRoot.replace(/'/g, "''")}' -DestinationPath '${outFile.replace(/'/g, "''")}' -Force`
    ], {
      stdio: "inherit",
      shell: false
    });
    return true;
  } catch {
    return false;
  }
}

async function createZip() {
  if (await zipWithArchiver()) return;

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
  if (fs.existsSync(checksumFile)) fs.unlinkSync(checksumFile);

  copyDirectory(rootReal, stagedRoot);
  await createZip();
  const digest = crypto.createHash("sha256").update(fs.readFileSync(outFile)).digest("hex").toUpperCase();
  fs.writeFileSync(checksumFile, `${digest}  ${path.basename(outFile)}\n`, "utf8");
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`Release archive created: ${outFile}`);
  console.log(`Size: ${sizeMb} MB`);
  console.log(`SHA-256: ${digest}`);
  console.log("Excluded: .env*, .git, node_modules, build, dist, release, logs, cache, coverage, zip archives, README.md");
}

main().catch(err => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  console.error(err);
  process.exit(1);
});
