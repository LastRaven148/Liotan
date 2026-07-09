const deleteUploadedFile =
  require("../../utils/deleteUploadedFile");

async function deleteAttachmentFile(
  attachment
) {

  await deleteUploadedFile({
    url:
      attachment?.url,
    mediaUrl:
      attachment?.mediaUrl,
    storageKey:
      attachment?.storageKey,
    storageType:
      attachment?.storageType,
    uploadId:
      attachment?.uploadId,
    mediaId:
      attachment?.mediaId
  });

}

module.exports =
  deleteAttachmentFile;
