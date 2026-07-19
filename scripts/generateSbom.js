#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const cli = path.join(root, "node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js");
const outputDir = path.join(root, "artifacts/sbom");
const projects = [
  ["root", root],
  ["client", path.join(root, "client")],
  ["server", path.join(root, "server")]
];

if (!fs.existsSync(cli)) {
  throw new Error("CycloneDX generator is not installed; run npm ci at the repository root");
}
fs.mkdirSync(outputDir, { recursive: true });

function integrityHashes(integrity) {
  return String(integrity || "").split(/\s+/).flatMap(value => {
    const match = /^(sha(?:256|384|512))-([A-Za-z0-9+/=]+)$/.exec(value);
    if (!match) return [];
    return [{
      alg: match[1].toUpperCase().replace(/^SHA(\d+)$/, "SHA-$1"),
      content: Buffer.from(match[2], "base64").toString("hex")
    }];
  });
}

function replaceObject(target, entries) {
  for (const key of Object.keys(target)) delete target[key];
  for (const [key, value] of entries) target[key] = value;
}

function normalizeComponent(component, lockPackages) {
  const packagePath = (component.properties || [])
    .find(property => property.name === "cdx:npm:package:path")?.value || "";
  const locked = lockPackages[packagePath];
  if (locked) {
    const properties = (component.properties || [])
      .filter(property => property.name !== "cdx:npm:package:development");
    if (locked.dev) {
      properties.unshift({ name: "cdx:npm:package:development", value: "true" });
    }
    component.properties = properties;
    const componentEntries = Object.entries(component).filter(([key]) => key !== "scope");
    if (locked.optional) {
      const insertAfter = Math.max(0, componentEntries.findIndex(([key]) => key === "description"));
      componentEntries.splice(insertAfter + 1, 0, ["scope", "optional"]);
    }
    replaceObject(component, componentEntries);

    const hashes = integrityHashes(locked.integrity);
    const distribution = (component.externalReferences || [])
      .find(reference => reference.type === "distribution");
    if (distribution) {
      const referenceEntries = Object.entries(distribution)
        .filter(([key]) => !["hashes", "comment"].includes(key));
      if (hashes.length) {
        referenceEntries.push(
          ["hashes", hashes],
          ["comment", "as detected from npm-ls property \"resolved\" and property \"integrity\""]
        );
      } else {
        referenceEntries.push(["comment", "as detected from npm-ls property \"resolved\""]);
      }
      replaceObject(distribution, referenceEntries);
    }
  }
  for (const child of component.components || []) normalizeComponent(child, lockPackages);
}

function normalizeFromLockfile(output, cwd) {
  const lock = JSON.parse(fs.readFileSync(path.join(cwd, "package-lock.json"), "utf8"));
  const bom = JSON.parse(fs.readFileSync(output, "utf8"));
  for (const component of bom.components || []) normalizeComponent(component, lock.packages || {});
  fs.writeFileSync(output, JSON.stringify(bom, null, 2), "utf8");
  return bom;
}

for (const [name, cwd] of projects) {
  const output = path.join(outputDir, `${name}.cdx.json`);
  execFileSync(process.execPath, [
    cli,
    "--gather-license-texts",
    "--output-reproducible",
    "--sv", "1.6",
    "--of", "JSON",
    "--validate",
    "-o", output,
    path.join(cwd, "package.json")
  ], { cwd, stdio: "inherit", shell: false });
  const bom = normalizeFromLockfile(output, cwd);
  if (bom.bomFormat !== "CycloneDX" || !Array.isArray(bom.components)) {
    throw new Error(`Invalid SBOM generated for ${name}`);
  }
  console.log(`${name}: ${bom.components.length} components`);
}
