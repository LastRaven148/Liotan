const uploadToCloudinary =
  require("../utils/uploadToCloudinary");

function fixFileName(name) {
  if (!name) {
    return "file";
  }

  try {
    const fixed =
      Buffer
        .from(name, "latin1")
        .toString("utf8");

    if (fixed && !fixed.includes("�")) {
      return fixed;
    }

    return name;
  } catch {
    return name;
  }
}

function getAttachmentType(mimeType) {
  if (mimeType.startsWith("image/")) {
    return "photo";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
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

async function uploadAttachment(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "no file"
      });
    }

    const type =
      getAttachmentType(req.file.mimetype);

    const result =
      await uploadToCloudinary(req.file, {
        folder: getFolder(type),
        resourceType: "auto"
      });

    res.json({
      url: result.secure_url,
      name: fixFileName(req.file.originalname),
      type,
      mimeType: req.file.mimetype,
      size: req.file.size,
      publicId: result.public_id,
      resourceType: result.resource_type,
      width: result.width || 0,
      height: result.height || 0,
      duration: result.duration || 0
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadAttachment
};