const path =
  require("path");

const fs =
  require("fs/promises");

const cloudinary =
  require("../config/cloudinary");

const logger =
  require("./logger");

const uploadsDir =
  path.resolve(
    __dirname,
    "..",
    "uploads"
  );

async function deleteLocalFile(
  fileUrl
) {

  try {

    if (
      !fileUrl ||
      !fileUrl.startsWith("/uploads/")
    ) {
      return;
    }

    const relative =
      fileUrl.replace(
        "/uploads/",
        ""
      );

    const filePath =
      path.resolve(
        uploadsDir,
        relative
      );

    if (
      !filePath.startsWith(
        uploadsDir + path.sep
      )
    ) {
      return;
    }

    await fs.unlink(filePath);

  } catch (err) {

    if (err.code !== "ENOENT") {
      logger.warn("delete local file failed", { code: err.code });
    }

  }

}

async function deleteCloudinaryFile({
  publicId,
  resourceType = "image"
}) {

  if (!publicId) {
    return;
  }

  try {

    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type:
          resourceType || "image"
      }
    );

  } catch (err) {

    logger.warn("delete cloudinary file failed", { code: err.code });

  }

}

async function deleteUploadedFile(
  file
) {

  if (!file) {
    return;
  }

  if (typeof file === "string") {
    await deleteLocalFile(file);
    return;
  }

  if (file.publicId) {
    await deleteCloudinaryFile({
      publicId:
        file.publicId,
      resourceType:
        file.resourceType
    });
  }

  if (file.url) {
    await deleteLocalFile(file.url);
  }

}

module.exports =
  deleteUploadedFile;