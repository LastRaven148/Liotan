const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { MAX_ATTACHMENT_SIZE, isAllowedAttachment } = require("../middleware/uploadSecurity");

const uploadTmpDir = path.join(os.tmpdir(), "liotan-uploads");
fs.mkdirSync(uploadTmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadTmpDir),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(16).toString("hex");
    cb(null, `${Date.now()}-${id}.upload`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedAttachment({ mimeType: file.mimetype, fileName: file.originalname, size: 0 })) {
      return cb(new Error("attachment is not allowed"));
    }
    cb(null, true);
  }
});

module.exports = upload;
