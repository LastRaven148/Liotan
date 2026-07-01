const Group = require("../../../models/Group");
const Message = require("../../../models/Messages");
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

function registerGetGroupChat({ socket }) {
  socket.on("getGroupChat", async (payload = {}) => {
    try {
      const username = socket.user.username;
      const groupId = payload.groupId;
      if (!groupId) return;

      const group = await Group.findById(groupId);
      if (!group || !group.members.includes(username)) return;

      const limit = parseLimit(payload.limit);
      const before = parseBefore(payload.before);
      const query = {
        chatType: "group",
        groupId,
        deletedFor: { $ne: username }
      };
      if (before) query.createdAt = { $lt: before };

      const messages = await Message.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();

      const hasMore = messages.length > limit;
      const page = messages.slice(0, limit).reverse();

      socket.emit("chatHistory", {
        chatId: `group:${groupId}`,
        groupId,
        msgs: serializeMessages(page),
        hasMore,
        nextBefore: hasMore ? page[0]?.createdAt : null
      });
    } catch (err) {
      socket.emit("chatError", { error: "group unavailable" });
    }
  });
}

module.exports = registerGetGroupChat;
