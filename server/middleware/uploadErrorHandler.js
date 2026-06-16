const multer =
  require("multer");

function uploadErrorHandler(
  err,
  req,
  res,
  next
) {

  if (err instanceof multer.MulterError) {

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "file too large"
      });
    }

    return res.status(400).json({
      error: "upload error"
    });

  }

  if (
    err.message ===
    "Invalid file type"
  ) {
    return res.status(400).json({
      error: "invalid file type"
    });
  }

  next(err);

}

module.exports =
  uploadErrorHandler;