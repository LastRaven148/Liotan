const fs = require("fs");
const path = require("path");

const uploadsPath = path.join(__dirname, "..", "uploads");
const avatarsPath = path.join(uploadsPath, "avatars");

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureUploadDirs() {
  ensureDirectory(uploadsPath);
  ensureDirectory(avatarsPath);
}

module.exports = {
  ensureUploadDirs,
  uploadsPath
};
