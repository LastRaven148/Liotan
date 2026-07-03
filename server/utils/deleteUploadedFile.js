const path = require("path");
const fs = require("fs/promises");
const logger = require("./logger");
const { deleteFromR2 } = require("./uploadToR2");

const uploadsDir = path.resolve(__dirname, "..", "uploads");

async function deleteLocalFile(fileUrl) {
  try {
    if (!fileUrl || !fileUrl.startsWith("/uploads/")) return;

    const relative = fileUrl.replace("/uploads/", "");
    const filePath = path.resolve(uploadsDir, relative);

    if (!filePath.startsWith(uploadsDir + path.sep)) return;

    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger.warn("delete local file failed", { code: err.code });
    }
  }
}

async function deleteUploadedFile(file) {
  if (!file) return;

  if (typeof file === "string") {
    await deleteLocalFile(file);
    return;
  }

  if (file.storageKey) {
    try {
      await deleteFromR2(file.storageKey);
    } catch (err) {
      logger.warn("delete R2 file failed", { code: err.code, status: err.status });
    }
  }

  if (file.url) {
    await deleteLocalFile(file.url);
  }
}

module.exports = deleteUploadedFile;
