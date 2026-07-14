"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const upload = require("../server/config/attachmentUpload");

const temporaryDirectory = path.join(os.tmpdir(), "liotan-uploads");

function store(bytes) {
  return new Promise(resolve => upload.storage._handleFile({}, {
    stream: Readable.from([bytes]),
    mimetype: "application/octet-stream",
    originalname: "regression.liotanmedia"
  }, (error, result) => resolve({ error, result })));
}

function remove(result) {
  return new Promise((resolve, reject) => upload.storage._removeFile({}, result, error => {
    if (error) reject(error);
    else resolve();
  }));
}

async function main() {
  const before = new Set(fs.readdirSync(temporaryDirectory));
  const rejected = await store(Buffer.from("this is plaintext"));
  assert(rejected.error && !rejected.result, "plaintext framing must be rejected before storage");

  const framedBytes = Buffer.concat([
    Buffer.from("LIOTANMLS1\0\0", "binary"),
    Buffer.alloc(64, 0xa5)
  ]);
  const accepted = await store(framedBytes);
  assert.ifError(accepted.error);
  assert.strictEqual(accepted.result.size, framedBytes.length);
  assert.strictEqual(
    accepted.result.ciphertextHash,
    crypto.createHash("sha256").update(framedBytes).digest("base64url"),
    "the upload stream must expose the exact hash without rereading the temporary file"
  );
  assert.deepStrictEqual(fs.readFileSync(accepted.result.path), framedBytes);
  await remove(accepted.result);

  const leaked = fs.readdirSync(temporaryDirectory).filter(name => !before.has(name));
  assert.deepStrictEqual(leaked, [], "media storage regression test must not leak temporary files");
  console.log("Ciphertext streaming storage checks passed.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
