const deleteAttachmentFile =
  require("./deleteAttachmentFile");

async function deleteMessageAttachments(
  messages
) {

  for (const msg of messages) {
    await deleteAttachmentFile(
      msg.attachment
    );
  }

}

module.exports =
  deleteMessageAttachments;