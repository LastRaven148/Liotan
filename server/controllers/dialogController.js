const User = require("../models/User");
const Message = require("../models/Messages");

function getMessagePreview(msg, attachment) {
  if (msg?.contentMode === "e2ee") {
    return "Encrypted message";
  }

  return msg?.text || getAttachmentPreview(attachment);
}

function getAttachmentPreview(attachment) {
  if (!attachment?.url) return "";
  if (attachment.type === "photo") return "Фото";
  if (attachment.type === "video") return "Видео";
  if (attachment.type === "audio") return attachment.name || "Аудио";
  if (attachment.type === "voice") return "Голосовое сообщение";
  if (attachment.type === "file") return attachment.name || "Файл";
  return attachment.name || "Файл";
}

function serializeAttachment(attachment) {
  if (!attachment?.url) return null;
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

function limitNumber(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

async function getDialogs(req, res, next) {
  try {
    const username = req.user.username;
    const limit = limitNumber(req.query.limit, 50, 100);

    const latestMessages = await Message.aggregate([
      {
        $match: {
          chatType: "private",
          deletedFor: { $ne: username },
          $or: [{ from: username }, { to: username }]
        }
      },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $addFields: {
          otherUser: {
            $cond: [{ $eq: ["$from", username] }, "$to", "$from"]
          }
        }
      },
      { $match: { otherUser: { $ne: "" } } },
      { $group: { _id: "$otherUser", message: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$message" } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: limit }
    ]);

    const otherUsernames = latestMessages.map(msg => msg.otherUser).filter(Boolean);
    const users = await User.find(
      { username: { $in: otherUsernames }, emailVerified: true },
      "username avatar bio lastSeen displayName"
    ).lean();

    const usersMap = new Map(users.map(user => [user.username, user]));

    const result = latestMessages
      .map(msg => {
        const user = usersMap.get(msg.otherUser);
        if (!user) return null;
        const attachment = serializeAttachment(msg.attachment);
        return {
          username: msg.otherUser,
          lastMessage: getMessagePreview(msg, attachment),
          attachment,
          lastMessageAttachment: attachment,
          lastAttachment: attachment,
          lastMessageType: attachment?.type || "",
          lastAttachmentName: attachment?.name || "",
          lastAttachmentUrl: attachment?.url || "",
          createdAt: msg.createdAt,
          avatar: user.avatar || "",
          bio: user.bio || "",
          displayName: user.displayName || "",
          lastSeen: user.lastSeen || null
        };
      })
      .filter(Boolean);

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getDialogs };
