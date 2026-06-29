const multer =
  require("multer");

const {
  MAX_ATTACHMENT_SIZE,
  isAllowedAttachment
} = require("../middleware/uploadSecurity");

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        MAX_ATTACHMENT_SIZE,
      files: 1
    },

    fileFilter: (req, file, cb) => {
      if (
        !isAllowedAttachment({
          mimeType: file.mimetype,
          fileName: file.originalname,
          size: 0
        })
      ) {
        return cb(
          new Error(
            "attachment is not allowed"
          )
        );
      }

      cb(null, true);
    }
  });

module.exports =
  upload;