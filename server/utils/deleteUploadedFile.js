const path =
  require("path");

const fs =
  require("fs/promises");

const uploadsDir =
  path.resolve(
    __dirname,
    "..",
    "uploads"
  );

async function deleteUploadedFile(
  fileUrl
) {

  try {

    if (
      !fileUrl ||
      !fileUrl.startsWith("/uploads/")
    ) {
      return;
    }

    const cleanUrl =
      fileUrl.replace(
        "/uploads/",
        ""
      );

    const filePath =
      path.resolve(
        uploadsDir,
        cleanUrl
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
      console.error(
        "DELETE UPLOADED FILE ERROR:",
        err.message
      );
    }

  }

}

module.exports =
  deleteUploadedFile;