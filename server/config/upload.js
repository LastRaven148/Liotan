const multer =
  require("multer");

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        2 * 1024 * 1024
    },

    fileFilter: (
      req,
      file,
      cb
    ) => {

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

      if (
        !allowedTypes.includes(
          file.mimetype
        )
      ) {
        return cb(
          new Error(
            "Invalid file type"
          )
        );
      }

      cb(null, true);

    }
  });

module.exports =
  upload;