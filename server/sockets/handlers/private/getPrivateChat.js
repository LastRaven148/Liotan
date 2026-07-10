const Message = require("../../../models/Messages");
const getChatId = require("../../../utils/getChatId");
const { getLegacyChatId, getPrivateChatParticipants } = getChatId;
const { isValidUsername } = require("../../../utils/validators");
const { serializeMessages } = require("../../services/serializeMessage");

function parseLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 50;
  return Math.min(Math.floor(number), 100);
}

function parseBefore(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function registerGetPrivateChat(socket) {
  socket.on("joinChat", (chatId) => {
    const username = socket.user.username;
    const raw = String(chatId || "");
    const parts = getPrivateChatParticipants(raw);

    if (parts.length !== 2 || !parts.includes(username) || !parts.every(isValidUsername)) return;

    const expected = getChatId(parts[0], parts[1]);
    if (expected !== raw) return;

    socket.join(raw);
  });

  socket.on("getChat", async (payload = {}) => {
    try {
      const user2 = payload.user2;
      if (!isValidUsername(user2)) return;

      const user1 = socket.user.username;
      const chatId = getChatId(user1, user2);
      const limit = parseLimit(payload.limit);
      const before = parseBefore(payload.before);

      const query = {
        chatType: { $ne: "group" },
        $or: [
          { chatId },
          {
            chatId: getLegacyChatId(user1, user2),
            $or: [
              { from: user1, to: user2 },
              { from: user2, to: user1 }
            ]
          }
        ],
        deletedFor: { $ne: user1 }
      };

      if (before) {
        query.createdAt = { $lt: before };
      }

      const msgs = await Message.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();

      const hasMore = msgs.length > limit;
      const page = msgs.slice(0, limit).reverse();

      socket.emit("chatHistory", {
        chatId,
        msgs: serializeMessages(page),
        hasMore,
        nextBefore: hasMore ? page[0]?.createdAt : null
      });
    } catch (err) {
      socket.emit("chatError", { error: "chat unavailable" });
    }
  });
}

module.exports = registerGetPrivateChat;
