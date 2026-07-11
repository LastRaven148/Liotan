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
  const bom = JSON.parse(fs.readFileSync(output, "utf8"));
  if (bom.bomFormat !== "CycloneDX" || !Array.isArray(bom.components)) {
    throw new Error(`Invalid SBOM generated for ${name}`);
  }
  console.log(`${name}: ${bom.components.length} components`);
}
