const cloudinary =
  require("../config/cloudinary");

const uploadToCloudinary =
  require("../utils/uploadToCloudinary");

const {
  MAX_ATTACHMENT_SIZE,
  normalizeMime,
  assertAllowedAttachment,
  assertSafeFileBuffer
} = require("../middleware/uploadSecurity");

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

function getAttachmentType(mimeType = "") {
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

function getResourceType(type) {
  if (type === "photo") {
    return "image";
  }

  if (
    type === "video" ||
    type === "audio"
  ) {
    return "video";
  }

  return "raw";
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

async function signAttachmentUpload(
  req,
  res,
  next
) {
  try {
    const mimeType =
      normalizeMime(
        typeof req.body.mimeType === "string"
          ? req.body.mimeType
          : ""
      );

    const size =
      Number(req.body.size) || 0;

    const fileName =
      typeof req.body.name === "string"
        ? req.body.name
        : "";

    assertAllowedAttachment({
      mimeType,
      fileName,
      size
    });

    const type =
      getAttachmentType(mimeType);

    const folder =
      getFolder(type);

    const resourceType =
      getResourceType(type);

    const timestamp =
      Math.round(
        Date.now() / 1000
      );

    const signature =
      cloudinary.utils.api_sign_request(
        {
          timestamp,
          folder
        },
        process.env.CLOUDINARY_API_SECRET
      );

    res.json({
      cloudName:
        process.env.CLOUDINARY_CLOUD_NAME,
      apiKey:
        process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      resourceType,
      type
    });
  } catch (err) {
    next(err);
  }
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

    const mimeType =
      normalizeMime(req.file.mimetype);

    assertAllowedAttachment({
      mimeType,
      fileName: req.file.originalname,
      size: req.file.size
    });

    assertSafeFileBuffer({
      buffer: req.file.buffer,
      mimeType
    });

    const type =
      getAttachmentType(
        mimeType
      );

    const result =
      await uploadToCloudinary(
        req.file,
        {
          folder:
            getFolder(type),
          resourceType:
            getResourceType(type)
        }
      );

    res.json({
      url:
        result.secure_url,
      name:
        fixFileName(req.file.originalname),
      type,
      mimeType,
      size:
        req.file.size,
      publicId:
        result.public_id,
      resourceType:
        result.resource_type,
      width:
        result.width || 0,
      height:
        result.height || 0,
      duration:
        result.duration || 0
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadAttachment,
  signAttachmentUpload,
  fixFileName,
  getAttachmentType
};