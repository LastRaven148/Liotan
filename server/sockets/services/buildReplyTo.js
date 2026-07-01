const Message =
  require("../../models/Messages");

async function buildReplyTo({
  replyTo,
  chatId,
  groupId = null
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

  return {
    messageId:
      original._id.toString(),
    from:
      original.from,
    text:
      original.contentMode === "e2ee"
        ? ""
        : original.text || "",
    attachmentType:
      original.attachment?.type || "",
    attachmentName:
      original.attachment?.name || ""
  };

}

module.exports =
  buildReplyTo;