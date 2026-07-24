"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
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

function ciphertextFramingValidator(onDigest, maximumBytes = MAX_ENCRYPTED_MEDIA_SIZE) {
  let prefix = Buffer.alloc(0);
  let validated = false;
  let bytes = 0;
  const hash = crypto.createHash("sha256");
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        return callback(new Error("encrypted media exceeded its signed byte reservation"));
      }
      hash.update(chunk);
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
      onDigest(hash.digest("base64url"));
      return callback();
    }
  });
}

const ciphertextDiskStorage = {
  _handleFile(req, file, callback) {
    const filename = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}.upload`;
    const filePath = path.join(uploadTmpDir, filename);
    const output = fs.createWriteStream(filePath, { flags: "wx", mode: 0o600 });
    let ciphertextHash = "";
    const maximumBytes = Number(req.cryptoMediaUpload?.declaredBytes);
    const validator = ciphertextFramingValidator(
      value => { ciphertextHash = value; },
      Number.isSafeInteger(maximumBytes) && maximumBytes > 0
        ? maximumBytes
        : MAX_ENCRYPTED_MEDIA_SIZE
    );
    pipeline(file.stream, validator, output, err => {
      if (err) {
        fs.unlink(filePath, () => callback(err));
        return;
      }
      callback(null, {
        destination: uploadTmpDir,
        filename,
        size: output.bytesWritten,
        ciphertextHash,
        openReadStream: () => fs.createReadStream(filePath, { flags: "r" }),
        removeManagedFile: async () => {
          try {
            await fsp.unlink(filePath);
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
          }
        }
      });
    });
  },
  _removeFile(_req, file, callback) {
    if (typeof file?.removeManagedFile !== "function") return callback();
    file.removeManagedFile().then(() => callback(), callback);
  }
};

const upload = multer({
  storage: ciphertextDiskStorage,
  limits: {
    fileSize: MAX_ENCRYPTED_MEDIA_SIZE,
    files: 1,
    // All binding metadata lives in the signed X-Liotan-Crypto-Body header.
    // Multipart is a ciphertext-only transport and rejects duplicate fields.
    fields: 0,
    parts: 2
  },
  fileFilter: (_req, file, callback) => {
    const valid = file.mimetype === "application/octet-stream" &&
      String(file.originalname || "").endsWith(".liotanmedia");
    callback(valid ? null : new Error("MLS ciphertext media required"), valid);
  }
});

module.exports = upload;
