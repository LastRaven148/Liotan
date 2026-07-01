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
