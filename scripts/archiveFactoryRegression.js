#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { createArchive } = require("./archiveFactory");

const expectedOptions = { zlib: { level: 9 }, forceLocalTime: false };
const legacyResult = { implementation: "v7" };
let legacyCall = null;
const legacyFactory = (format, options) => {
  legacyCall = { format, options };
  return legacyResult;
};

assert.strictEqual(createArchive({ default: legacyFactory }, "zip", expectedOptions), legacyResult);
assert.deepStrictEqual(legacyCall, { format: "zip", options: expectedOptions });

class TestZipArchive {
  constructor(options) {
    this.implementation = "v8";
    this.options = options;
  }
}

const modernResult = createArchive({ ZipArchive: TestZipArchive }, "zip", expectedOptions);
assert(modernResult instanceof TestZipArchive);
assert.strictEqual(modernResult.options, expectedOptions);
assert.throws(() => createArchive({}, "zip", expectedOptions), /Unsupported archiver module export/);

import("archiver").then(actualModule => {
  const actualArchive = createArchive(actualModule, "zip", expectedOptions);
  assert.strictEqual(typeof actualArchive.pipe, "function");
  assert.strictEqual(typeof actualArchive.directory, "function");
  assert.strictEqual(typeof actualArchive.finalize, "function");
  actualArchive.abort?.();
  console.log("Archiver v7/v8 compatibility checks passed.");
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
