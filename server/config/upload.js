const multer =
  require("multer");

const path =
  require("path");

const storage =
  multer.diskStorage({
    destination: (
      req,
      file,
      cb
    ) => {
      cb(
        null,
        path.join(
          __dirname,
          "..",
          "uploads",
          "avatars"
        )
      );
    },

    filename: (
      req,
      file,
      cb
    ) => {
      const ext =
        path.extname(
          file.originalname
        );

      cb(
        null,
        Date.now() + ext
      );
    }
  });

const upload =
  multer({
    storage,

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

module.exports = upload;