"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const SHA_RE = /^[0-9a-f]{40}$/;

function gitRevision(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim().toLowerCase();
}

function resolveSourceRevision(root = path.resolve(__dirname, "..")) {
  const actual = gitRevision(root);
  if (!SHA_RE.test(actual)) throw new Error("Git HEAD is not a full SHA-1 revision");
  const declared = String(process.env.LIOTAN_SOURCE_SHA || process.env.GITHUB_SHA || "")
    .trim()
    .toLowerCase();
  if (declared && (!SHA_RE.test(declared) || declared !== actual)) {
    throw new Error("Declared source revision does not match the checked-out Git HEAD");
  }
  return actual;
}

function assertCleanTrackedSource(root = path.resolve(__dirname, "..")) {
  const changes = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=no"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  if (changes) {
    throw new Error("Release archives may only be created from a clean tracked source tree");
  }
}

module.exports = {
  SHA_RE,
  assertCleanTrackedSource,
  resolveSourceRevision
};
