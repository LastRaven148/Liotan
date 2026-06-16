function uploadAttachment(
  req,
  res
) {

  if (!req.file) {
    return res.status(400).json({
      error: "no file"
    });
  }

  const isPhoto =
    req.file.mimetype.startsWith(
      "image/"
    );

  res.json({
    url:
      `/uploads/attachments/${req.file.filename}`,
    name:
      req.file.originalname,
    type:
      isPhoto
        ? "photo"
        : "file",
    mimeType:
      req.file.mimetype,
    size:
      req.file.size
  });

}

module.exports = {
  uploadAttachment
};