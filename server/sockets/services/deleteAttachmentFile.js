const path =
  require("path");

const fs =
  require("fs/promises");

const attachmentsDir =
  path.resolve(
    __dirname,
    "..",
    "..",
    "uploads",
    "attachments"
  );

async function deleteAttachmentFile(
  attachment
) {

  try {

    const url =
      attachment?.url;

    if (
      !url ||
      !url.startsWith(
        "/uploads/attachments/"
      )
    ) {
      return;
    }

    const filename =
      path.basename(url);

    const filePath =
      path.resolve(
        attachmentsDir,
        filename
      );

    if (
      !filePath.startsWith(
        attachmentsDir + path.sep
      )
    ) {
      return;
    }

    await fs.unlink(filePath);

  } catch (err) {

    if (err.code !== "ENOENT") {
      console.error(
        "DELETE ATTACHMENT ERROR:",
        err.message
      );
    }

  }

}

const deleteUploadedFile =
  require("../../utils/deleteUploadedFile");

async function deleteAttachmentFile(
  attachment
) {

  await deleteUploadedFile({
    url:
      attachment?.url,
    publicId:
      attachment?.publicId,
    resourceType:
      attachment?.resourceType
  });

}

module.exports =
  deleteAttachmentFile;