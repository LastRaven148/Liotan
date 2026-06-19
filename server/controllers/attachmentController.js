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

const uploadToCloudinary =
  require("../utils/uploadToCloudinary");

async function uploadAttachment(
  req,
  res,
  next
) {

  try {

    if (!req.file) {
      return res.status(400).json({
        error: "no file"
      });
    }

    const isPhoto =
      req.file.mimetype.startsWith(
        "image/"
      );

    const result =
      await uploadToCloudinary(
        req.file,
        {
          folder:
            isPhoto
              ? "liotan/photos"
              : "liotan/files",
          resourceType: "auto"
        }
      );

    res.json({
      url:
        result.secure_url,
      name:
        req.file.originalname,
      type:
        isPhoto
          ? "photo"
          : "file",
      mimeType:
        req.file.mimetype,
      size:
        req.file.size,
      publicId:
        result.public_id,
      resourceType:
        result.resource_type
    });

  } catch (err) {
    next(err);
  }

}

module.exports = {
  uploadAttachment
};