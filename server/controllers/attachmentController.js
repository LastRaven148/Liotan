const uploadToCloudinary =
  require("../utils/uploadToCloudinary");

function getAttachmentType(mimeType) {

  if (
    mimeType.startsWith("image/")
  ) {
    return "photo";
  }

  if (
    mimeType.startsWith("video/")
  ) {
    return "video";
  }

  if (
    mimeType.startsWith("audio/")
  ) {
    return "audio";
  }

  return "file";

}

function getFolder(type) {

  if (type === "photo") {
    return "liotan/photos";
  }

  if (type === "video") {
    return "liotan/videos";
  }

  if (type === "audio") {
    return "liotan/audio";
  }

  return "liotan/files";

}

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

    const type =
      getAttachmentType(
        req.file.mimetype
      );

    const result =
      await uploadToCloudinary(
        req.file,
        {
          folder:
            getFolder(type),
          resourceType: "auto"
        }
      );

    res.json({
      url:
        result.secure_url,
      name:
        req.file.originalname,
      type,
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