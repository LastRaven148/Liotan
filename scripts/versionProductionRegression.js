#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  compareVersions,
  parseVersion,
  verifySynchronization,
  verifyVersionRecords
} = require("./versionProduction");

assert.deepEqual(parseVersion("57.4.0"), [57, 4, 0]);
for (const invalid of ["", "v57.4.0", "57.04.0", "57.4", "57.4.0-beta.1"]) {
  assert.throws(() => parseVersion(invalid), /Invalid production version/);
}
assert.equal(compareVersions("57.4.1", "57.4.0"), 1);
assert.equal(compareVersions("57.4.0", "57.4.0"), 0);
assert.equal(compareVersions("57.3.9", "57.4.0"), -1);
assert.throws(
  () => verifyVersionRecords([
    { path: "package.json", version: "57.4.0" },
    { path: "client/package-lock.json", version: "57.4.1" }
  ]),
  /Version mismatch/
);
assert.equal(verifySynchronization(), "57.4.0");

console.log("Production version synchronization and monotonicity checks passed.");
