const deleteUploadedFile =
  require("../../utils/deleteUploadedFile");

async function deleteAttachmentFile(
  attachment
) {

  await deleteUploadedFile({
    url:
      attachment?.url,
    storageKey:
      attachment?.storageKey,
    storageType:
      attachment?.storageType
  });

}

module.exports =
  deleteAttachmentFile;
