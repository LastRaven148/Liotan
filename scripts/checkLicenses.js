#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "artifacts/licenses");
const projects = [
  ["root", root],
  ["client", path.join(root, "client")],
  ["server", path.join(root, "server")]
];
const forbidden = /(^|\W)(UNLICENSED|SEE LICENSE IN)(\W|$)/i;

function packageNameFromLockPath(lockPath, record) {
  if (record.name) return record.name;
  const parts = lockPath.split("node_modules/").filter(Boolean).at(-1)?.split("/") || [];
  return parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1] || ""}` : parts[0] || "";
}

function installedManifest(projectDir, lockPath) {
  const manifest = path.join(projectDir, lockPath, "package.json");
  if (!fs.existsSync(manifest)) return null;
  return JSON.parse(fs.readFileSync(manifest, "utf8"));
}

const inventory = [];
const failures = [];
for (const [project, projectDir] of projects) {
  const lock = JSON.parse(fs.readFileSync(path.join(projectDir, "package-lock.json"), "utf8"));
  for (const [lockPath, record] of Object.entries(lock.packages || {})) {
    if (!lockPath || !lockPath.includes("node_modules/")) continue;
    const installed = installedManifest(projectDir, lockPath);
    const name = packageNameFromLockPath(lockPath, record);
    const version = record.version || installed?.version || "";
    const legacyLicenses = Array.isArray(installed?.licenses)
      ? installed.licenses.map(item => typeof item === "string" ? item : item?.type).filter(Boolean).join(" OR ")
      : "";
    const license = String(record.license || installed?.license || legacyLicenses || "").trim();
    const entry = {
      project,
      name,
      version,
      license,
      development: Boolean(record.dev),
      optional: Boolean(record.optional)
    };
    inventory.push(entry);
    if (!name || !version || !license || forbidden.test(license)) {
      failures.push(entry);
    }
  }
}

inventory.sort((a, b) => `${a.project}:${a.name}:${a.version}`.localeCompare(`${b.project}:${b.name}:${b.version}`));
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "license-inventory.json"),
  `${JSON.stringify({ schemaVersion: 1, generatedFrom: "package-lock.json and installed manifests", packages: inventory }, null, 2)}\n`,
  "utf8"
);

if (failures.length) {
  for (const item of failures) {
    console.error(`Missing or unacceptable license metadata: ${item.project}:${item.name}@${item.version} (${item.license || "missing"})`);
  }
  process.exitCode = 1;
} else {
  console.log(`License policy passed for ${inventory.length} locked package entries.`);
}
