#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const version = String(rootPackage.version || "dev");
const outDir = path.join(root, "release");
const outFile = path.join(outDir, `Liotan-${version}-clean.zip`);
const tmpDir = path.join(os.tmpdir(), `liotan-release-${process.pid}-${Date.now()}`);
const stagedRoot = path.join(tmpDir, "Liotan");
const WINDOWS_EXTENSIONS = [".cmd", ".exe", ".bat"];

function getPathEntries() {
  return String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
}

function resolveExecutable(command) {
  if (!/^[A-Za-z0-9._-]+$/.test(command)) {
    return "";
  }

  const candidates = process.platform === "win32"
    ? [command, ...WINDOWS_EXTENSIONS.map(ext => `${command}${ext}`)]
    : [command];

  for (const dir of getPathEntries()) {
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return "";
}

function safeChildPath(parent, name) {
  if (typeof name !== "string" || name.includes("/") || name.includes("\\")) {
    throw new Error("Unsafe filesystem entry name in release source");
  }

  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(resolvedParent, name);
  const relative = path.relative(resolvedParent, resolvedChild);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to copy a path outside the expected release tree");
  }

  return resolvedChild;
}

const EXCLUDED_NAMES = new Set([
  ".git",
  "node_modules",
  ".env",
  "dist",
  "build",
  "release",
  "README.md",
  "coverage",
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

function shouldExclude(fullPath) {
  const rel = toPosix(path.relative(root, fullPath));
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
  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = safeChildPath(source, entry.name);
    if (shouldExclude(sourcePath)) continue;

    const destinationPath = safeChildPath(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function commandExists(command) {
  return Boolean(resolveExecutable(command));
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

  const zipPath = resolveExecutable("zip");
  if (!zipPath) {
    return false;
  }

  execFileSync(zipPath, ["-qr", outFile, "Liotan"], {
    cwd: tmpDir,
    stdio: "inherit"
  });

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

  const powershellPath = resolveExecutable("powershell");
  if (!powershellPath) {
    return false;
  }

  execFileSync(powershellPath, command, { stdio: "inherit" });

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
  console.log("Excluded: .env*, .git, node_modules, build, dist, release, logs, cache, coverage, zip archives, README.md");
}

main().catch(err => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  console.error(err);
  process.exit(1);
});
