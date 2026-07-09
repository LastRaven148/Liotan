const Message =
  require("../../models/Messages");

const ENCRYPTED_REPLY_PLACEHOLDER =
  "encrypted";

function shouldHideReplyPreview({
  currentContentMode,
  originalContentMode
}) {
  return currentContentMode === "e2ee" ||
    originalContentMode === "e2ee";
}

async function buildReplyTo({
  replyTo,
  chatId,
  groupId = null,
  currentContentMode = "plain"
}) {

  if (!replyTo?.messageId) {
    return undefined;
  }

  const query =
    groupId
      ? {
          _id: replyTo.messageId,
          chatType: "group",
          groupId
        }
      : {
          _id: replyTo.messageId,
          chatId
        };

  const original =
    await Message.findOne(query);

  if (!original) {
    return undefined;
  }

  const hidePreview =
    shouldHideReplyPreview({
      currentContentMode,
      originalContentMode: original.contentMode
    });

  return {
    messageId:
      original._id.toString(),
    from:
      original.from,
    text:
      hidePreview
        ? ""
        : original.text || "",
    attachmentType:
      original.attachment?.type || "",
    attachmentName:
      hidePreview
        ? ""
        : original.attachment?.name || "",
    previewMode:
      hidePreview
        ? ENCRYPTED_REPLY_PLACEHOLDER
        : "plain"
  };

}

module.exports =
  buildReplyTo;

module.exports.shouldHideReplyPreview =
  shouldHideReplyPreview;
