const fs = require("fs");
const cloudinary = require("../config/cloudinary");
const { getCloudinaryAllowedFormats } = require("./attachmentSafety");

const LARGE_FILE_LIMIT = 45 * 1024 * 1024;

function getResourceType(file, options) {
  if (options.resourceType) return options.resourceType;
  if (file.mimetype?.startsWith("image/")) return "image";
  if (file.mimetype?.startsWith("video/")) return "video";
  return "raw";
}

function uploadToCloudinary(file, options = {}) {
  return new Promise((resolve, reject) => {
    const resourceType = getResourceType(file, options);
    const uploadOptions = {
      folder: options.folder || "liotan",
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      overwrite: false
    };

    if (options.attachmentType) {
      uploadOptions.allowed_formats = getCloudinaryAllowedFormats(options.attachmentType);
    }

    if (resourceType === "image") {
      uploadOptions.quality = "auto:best";
      uploadOptions.fetch_format = "auto";
    }

    const done = (error, result) => {
      if (error) return reject(error);
      resolve(result);
    };

    if (file.path && file.size > LARGE_FILE_LIMIT) {
      cloudinary.uploader.upload_large(file.path, { ...uploadOptions, chunk_size: 10 * 1024 * 1024 }, done);
      return;
    }

    const stream = cloudinary.uploader.upload_stream(uploadOptions, done);

    if (file.path) {
      fs.createReadStream(file.path).on("error", reject).pipe(stream);
      return;
    }

    stream.end(file.buffer);
  });
}

module.exports = uploadToCloudinary;
