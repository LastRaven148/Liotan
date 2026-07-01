#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const root = path.resolve(__dirname, "..");
const rootPackage = require(path.join(root, "package.json"));
const version = String(rootPackage.version || "dev");
const outDir = path.join(root, "release");
const outFile = path.join(outDir, `Liotan-${version}-clean.zip`);

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

function addDirectory(archive, dir, archivePrefix = "Liotan") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldExclude(fullPath)) continue;

    const rel = toPosix(path.relative(root, fullPath));
    const archiveName = `${archivePrefix}/${rel}`;

    if (entry.isDirectory()) {
      addDirectory(archive, fullPath, archivePrefix);
    } else if (entry.isFile()) {
      archive.file(fullPath, { name: archiveName });
    }
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  const output = fs.createWriteStream(outFile);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });

  archive.pipe(output);
  addDirectory(archive, root);
  await archive.finalize();
  await done;

  const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`Release archive created: ${outFile}`);
  console.log(`Size: ${sizeMb} MB`);
  console.log("Excluded: .env, .git, node_modules, build, dist, release, README.md");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
