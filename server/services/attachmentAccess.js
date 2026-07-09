const Message = require("../models/Messages");
const Group = require("../models/Group");

function safeUploadId(value = "") {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

async function findAccessibleAttachment({ uploadId, username }) {
  const safeId = safeUploadId(uploadId);
  if (!safeId || !username) return null;

  const message = await Message.findOne({
    "attachment.uploadId": safeId,
    deletedFor: { $ne: username }
  }).lean();

  if (!message?.attachment?.storageKey) return null;

  if (message.chatType === "private") {
    if (message.from !== username && message.to !== username) {
      return null;
    }
  } else if (message.chatType === "group") {
    const group = await Group.findOne({
      _id: message.groupId,
      members: username
    }, "_id").lean();

    if (!group) return null;
  } else {
    return null;
  }

  return {
    message,
    attachment: message.attachment
  };
}

module.exports = {
  findAccessibleAttachment,
  safeUploadId
};
