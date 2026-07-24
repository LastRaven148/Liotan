#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const projects = [
  { packagePath: "package.json", lockPath: "package-lock.json" },
  { packagePath: "client/package.json", lockPath: "client/package-lock.json" },
  { packagePath: "server/package.json", lockPath: "server/package-lock.json" }
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(
    path.join(root, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
}

function parseVersion(version) {
  const match = semverPattern.exec(String(version || ""));
  if (!match) throw new Error(`Invalid production version: ${version}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function verifyVersionRecords(records) {
  const expected = String(records[0]?.version || "");
  parseVersion(expected);
  for (const record of records) {
    const version = String(record.version || "");
    parseVersion(version);
    if (version !== expected) {
      throw new Error(`Version mismatch: ${record.path} has ${version}, expected ${expected}`);
    }
  }
  return expected;
}

function versionRecords() {
  return projects.flatMap(project => {
    const packageJson = readJson(project.packagePath);
    const lockJson = readJson(project.lockPath);
    if (!lockJson.packages?.[""]) {
      throw new Error(`Lockfile is missing its root package record: ${project.lockPath}`);
    }
    return [
      { path: project.packagePath, version: packageJson.version },
      { path: project.lockPath, version: lockJson.version },
      { path: `${project.lockPath}#packages[""]`, version: lockJson.packages[""].version }
    ];
  });
}

function verifySynchronization() {
  return verifyVersionRecords(versionRecords());
}

function readVersionAtCommit(commitSha) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error("A valid base commit SHA is required");
  }
  const content = execFileSync("git", ["show", `${commitSha}:package.json`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });
  const version = String(JSON.parse(content).version || "");
  parseVersion(version);
  return version;
}

function updateVersion(nextVersion) {
  parseVersion(nextVersion);
  const updates = [];
  for (const project of projects) {
    const packageJson = readJson(project.packagePath);
    const lockJson = readJson(project.lockPath);
    if (!lockJson.packages?.[""]) {
      throw new Error(`Lockfile is missing its root package record: ${project.lockPath}`);
    }
    packageJson.version = nextVersion;
    lockJson.version = nextVersion;
    lockJson.packages[""].version = nextVersion;
    updates.push([project.packagePath, packageJson], [project.lockPath, lockJson]);
  }
  for (const [relativePath, value] of updates) writeJson(relativePath, value);
  verifySynchronization();
}

function main(args = process.argv.slice(2)) {
  const command = String(args[0] || "");
  if (command === "--check") {
    if (args.length > 2) throw new Error("Usage: versionProduction.js --check [base-sha]");
    const version = verifySynchronization();
    const baseSha = String(args[1] || "");
    if (baseSha) {
      const baseVersion = readVersionAtCommit(baseSha);
      if (compareVersions(version, baseVersion) <= 0) {
        throw new Error(`Production version must increase: base=${baseVersion}, current=${version}`);
      }
    }
    console.log(`Production version is valid: ${version}`);
    return;
  }

  if (args.length > 1) throw new Error("Usage: versionProduction.js [next-version]");
  const current = verifySynchronization();
  const requested = command.trim();
  const [major, minor, patch] = parseVersion(current);
  const next = requested || `${major}.${minor}.${patch + 1}`;
  if (compareVersions(next, current) <= 0) {
    throw new Error(`New version ${next} must be greater than ${current}`);
  }
  updateVersion(next);
  console.log(`Production version: ${current} -> ${next}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  compareVersions,
  main,
  parseVersion,
  readVersionAtCommit,
  updateVersion,
  verifySynchronization,
  verifyVersionRecords
};
