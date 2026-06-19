const multer =
  require("multer");

const path =
  require("path");

const fs =
  require("fs");

const uploadDir =
  path.join(
    __dirname,
    "..",
    "uploads",
    "attachments"
  );

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(
    uploadDir,
    {
      recursive: true
    }
  );
}

const storage =
  multer.diskStorage({
    destination(req, file, cb) {
      cb(null, uploadDir);
    },

    filename(req, file, cb) {
      const ext =
        path.extname(file.originalname);

      cb(
        null,
        `${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}${ext}`
      );
    }
  });

const attachmentUpload =
  multer({
    storage,
    limits: {
      fileSize:
        20 * 1024 * 1024
    }
  });

module.exports =
  attachmentUpload;

  const multer =
  require("multer");

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        20 * 1024 * 1024
    }
  });

module.exports =
  upload;