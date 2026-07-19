"use strict";

const User = require("../models/User");
const CryptoConversation = require("../models/CryptoConversation");

function limitNumber(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

async function getDialogs(req, res, next) {
  try {
    const limit = limitNumber(req.query.limit, 50, 100);
    const conversations = await CryptoConversation.find({
      chatType: "private",
      participantUserIds: req.user.userId,
      lifecycleState: { $ne: "deleting" }
    }).sort({ updatedAt: -1, _id: -1 }).limit(limit).lean();

    const usernames = conversations.map(conversation => {
      const others = (conversation.participantUsernames || [])
        .filter(username => username !== req.user.username);
      return others[0] || req.user.username;
    });
    const users = await User.find({
      username: { $in: [...new Set(usernames)] },
      emailVerified: true,
      lifecycleState: { $ne: "deleting" }
    }, "username avatar bio lastSeen displayName").lean();
    const usersByName = new Map(users.map(user => [user.username, user]));

    return res.json(conversations.map((conversation, index) => {
      const username = usernames[index];
      const user = usersByName.get(username);
      if (!user) return null;
      return {
        username,
        protocol: "mls-1.0",
        conversationId: conversation.conversationId,
        lastMessage: "Защищённый чат",
        attachment: null,
        lastMessageAttachment: null,
        lastAttachment: null,
        lastMessageType: "",
        lastAttachmentName: "",
        lastAttachmentUrl: "",
        createdAt: conversation.updatedAt || conversation.createdAt,
        avatar: user.avatar || "",
        bio: user.bio || "",
        displayName: user.displayName || "",
        lastSeen: user.lastSeen || null
      };
    }).filter(Boolean));
  } catch (err) {
    return next(err);
  }
}

module.exports = { getDialogs };
