"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Transform, pipeline } = require("stream");
const multer = require("multer");
const { MAX_ENCRYPTED_MEDIA_SIZE } = require("../middleware/uploadSecurity");

const uploadTmpDir = path.join(os.tmpdir(), "liotan-uploads");
const MLS_MEDIA_MAGIC = Buffer.from("LIOTANMLS1\0\0", "binary");
fs.mkdirSync(uploadTmpDir, { recursive: true, mode: 0o700 });
try { fs.chmodSync(uploadTmpDir, 0o700); } catch {}

for (const entry of fs.readdirSync(uploadTmpDir, { withFileTypes: true })) {
  if (!entry.isFile() || !/^\d{13}-[0-9a-f]{32}\.upload$/.test(entry.name)) continue;
  const candidate = path.join(uploadTmpDir, entry.name);
  try {
    if (Date.now() - fs.statSync(candidate).mtimeMs > 60 * 60 * 1000) fs.unlinkSync(candidate);
  } catch {}
}

function ciphertextFramingValidator() {
  let prefix = Buffer.alloc(0);
  let validated = false;
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (validated) return callback(null, chunk);
      prefix = Buffer.concat([prefix, chunk]);
      if (prefix.length < MLS_MEDIA_MAGIC.length) return callback();
      if (!crypto.timingSafeEqual(prefix.subarray(0, MLS_MEDIA_MAGIC.length), MLS_MEDIA_MAGIC)) {
        return callback(new Error("MLS ciphertext media framing required"));
      }
      validated = true;
      const output = prefix;
      prefix = Buffer.alloc(0);
      return callback(null, output);
    },
    flush(callback) {
      if (!validated) return callback(new Error("MLS ciphertext media framing required"));
      return callback();
    }
  });
}

const ciphertextDiskStorage = {
  _handleFile(_req, file, callback) {
    const filename = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}.upload`;
    const filePath = path.join(uploadTmpDir, filename);
    const output = fs.createWriteStream(filePath, { flags: "wx", mode: 0o600 });
    const validator = ciphertextFramingValidator();
    pipeline(file.stream, validator, output, err => {
      if (err) {
        fs.unlink(filePath, () => callback(err));
        return;
      }
      callback(null, { destination: uploadTmpDir, filename, path: filePath, size: output.bytesWritten });
    });
  },
  _removeFile(_req, file, callback) {
    if (!file?.path) return callback();
    fs.unlink(file.path, err => callback(err?.code === "ENOENT" ? null : err));
  }
};

const upload = multer({
  storage: ciphertextDiskStorage,
  limits: {
    fileSize: MAX_ENCRYPTED_MEDIA_SIZE,
    files: 1,
    fields: 5,
    parts: 6
  },
  fileFilter: (_req, file, callback) => {
    const valid = file.mimetype === "application/octet-stream" &&
      String(file.originalname || "").endsWith(".liotanmedia");
    callback(valid ? null : new Error("MLS ciphertext media required"), valid);
  }
});

module.exports = upload;
