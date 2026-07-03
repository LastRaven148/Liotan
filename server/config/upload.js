const multer = require("multer");
const { MAX_AVATAR_SIZE, isAllowedAvatar } = require("../middleware/uploadSecurity");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_SIZE,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedAvatar({
      mimeType: file.mimetype,
      fileName: file.originalname,
      size: 0
    })) {
      return cb(new Error("avatar is not allowed"));
    }

    cb(null, true);
  }
});

module.exports = upload;
