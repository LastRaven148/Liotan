const User =
  require("../models/User");

const Message =
  require("../models/Messages");

function getAttachmentPreview(
  attachment
) {
  if (!attachment?.url) {
    return "";
  }

  if (attachment.type === "photo") {
    return "Фото";
  }

  if (attachment.type === "video") {
    return "Видео";
  }

  if (attachment.type === "audio") {
    return attachment.name || "Аудио";
  }

  if (attachment.type === "file") {
    return attachment.name || "Файл";
  }

  return attachment.name || "Файл";
}

function serializeAttachment(
  attachment
) {
  if (!attachment?.url) {
    return null;
  }

  return {
    url: attachment.url || "",
    name: attachment.name || "",
    type: attachment.type || "",
    mimeType: attachment.mimeType || "",
    size: attachment.size || 0,
    width: attachment.width || 0,
    height: attachment.height || 0,
    duration: attachment.duration || 0,
    publicId: attachment.publicId || "",
    resourceType: attachment.resourceType || "auto"
  };
}

async function getDialogs(
  req,
  res,
  next
) {
  try {
    const username =
      req.user.username;

    const messages =
      await Message.find({
        chatType: "private",
        deletedFor: {
          $ne: username
        },
        $or: [
          { from: username },
          { to: username }
        ]
      })
        .sort({
          createdAt: -1
        })
        .lean();

    const dialogs = [];

    const seen =
      new Set();

    const otherUsernames =
      [];

    for (const msg of messages) {
      const otherUser =
        msg.from === username
          ? msg.to
          : msg.from;

      if (
        !otherUser ||
        seen.has(otherUser)
      ) {
        continue;
      }

      seen.add(otherUser);
      otherUsernames.push(otherUser);

      const attachment =
        serializeAttachment(
          msg.attachment
        );

      dialogs.push({
        username: otherUser,
        lastMessage:
          msg.text ||
          getAttachmentPreview(
            attachment
          ),
        attachment,
        lastMessageAttachment:
          attachment,
        lastAttachment:
          attachment,
        lastMessageType:
          attachment?.type || "",
        lastAttachmentName:
          attachment?.name || "",
        lastAttachmentUrl:
          attachment?.url || "",
        createdAt: msg.createdAt
      });
    }

    const users =
      await User.find(
        {
          username: {
            $in: otherUsernames
          }
        },
        "username avatar bio lastSeen displayName"
      ).lean();

    const usersMap =
      new Map(
        users.map(user => [
          user.username,
          user
        ])
      );

    const result =
      dialogs.map(dialog => {
        const user =
          usersMap.get(
            dialog.username
          );

        return {
          ...dialog,
          avatar:
            user?.avatar || "",
          bio:
            user?.bio || "",
          displayName:
            user?.displayName || "",
          lastSeen:
            user?.lastSeen || null
        };
      });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDialogs
};
