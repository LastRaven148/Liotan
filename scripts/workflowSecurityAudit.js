#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflows = path.join(root, ".github", "workflows");
const ci = fs.readFileSync(path.join(workflows, "ci.yml"), "utf8");
const codeql = fs.readFileSync(path.join(workflows, "codeql.yml"), "utf8");
const deploy = fs.readFileSync(path.join(workflows, "deploy-vps.yml"), "utf8");
const all = fs.readdirSync(workflows)
  .filter(name => /\.ya?ml$/.test(name))
  .map(name => fs.readFileSync(path.join(workflows, name), "utf8"))
  .join("\n");

for (const match of all.matchAll(/^\s*uses:\s*([^#\s]+)(?:\s*#.*)?$/gm)) {
  const reference = match[1];
  if (reference.startsWith("./")) continue;
  assert.match(reference, /@[0-9a-f]{40}$/, `GitHub Action is not pinned to a full commit: ${reference}`);
}
assert.doesNotMatch(all, /\bpull_request_target\s*:/, "pull_request_target is forbidden");
assert.match(ci, /^permissions:\s*\n\s+contents:\s+read\s*$/m,
  "CI default token permissions must be read-only");
assert.match(ci, /attest:[\s\S]*permissions:[\s\S]*id-token:\s*write[\s\S]*attestations:\s*write/,
  "provenance writes must be isolated to the attestation job");
assert.doesNotMatch(codeql.split("jobs:")[0], /security-events:\s*write/,
  "CodeQL write permission must not be workflow-global");
assert.match(codeql, /analyze:[\s\S]*permissions:[\s\S]*security-events:\s*write/,
  "CodeQL analysis job needs its scoped upload permission");
const lines = deploy.split(/\r?\n/);
for (let index = 0; index < lines.length; index += 1) {
  const match = /^(\s*)run:\s*\|/.exec(lines[index]);
  if (!match) continue;
  const indent = match[1].length;
  const body = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const nextIndent = /^\s*/.exec(lines[cursor])[0].length;
    if (lines[cursor].trim() && nextIndent <= indent) break;
    body.push(lines[cursor]);
  }
  assert.doesNotMatch(body.join("\n"), /\$\{\{\s*inputs\.release_sha\s*\}\}/,
    "manual workflow input must enter shell only through a validated environment variable");
}
assert.match(deploy, /gh attestation verify "\$BUNDLE"/,
  "production deployment must verify GitHub build provenance");
assert.match(ci, /DEPLOYMENT-MANIFEST\.json/,
  "deployment bundle must bind the exact source revision");

console.log("Workflow permission, pinning, interpolation and provenance checks passed.");
