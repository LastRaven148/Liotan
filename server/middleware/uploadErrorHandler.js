const multer = require("multer");

function uploadErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "file too large",
        requestId: req.id
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "too many files",
        requestId: req.id
      });
    }

    return res.status(400).json({
      error: "upload error",
      requestId: req.id
    });
  }

  if (err.message === "Invalid file type" || err.message === "attachment is not allowed" || err.message === "avatar is not allowed" || err.message === "file content does not match declared type") {
    return res.status(400).json({
      error: "invalid file type",
      requestId: req.id
    });
  }

  next(err);
}

module.exports = uploadErrorHandler;
