const Group = require("../models/Group");
const Message = require("../models/Messages");
const { serializeMessages } = require("../sockets/services/serializeMessage");

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

async function getGroupMessages(req, res, next) {
  try {
    const username = req.user.username;
    const group = await Group.findById(req.params.id);

    if (!group) return res.status(404).json({ error: "group not found" });
    if (!group.members.includes(username)) return res.status(403).json({ error: "access denied" });

    const limit = parseLimit(req.query.limit);
    const before = parseBefore(req.query.before);
    const query = {
      chatType: "group",
      groupId: group._id,
      deletedFor: { $ne: username }
    };

    if (before) query.createdAt = { $lt: before };

    const messages = await Message.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = messages.length > limit;
    const page = messages.slice(0, limit).reverse();

    res.json({ messages: serializeMessages(page), hasMore, nextBefore: hasMore ? page[0]?.createdAt : null });
  } catch (err) {
    next(err);
  }
}

module.exports = { getGroupMessages };
