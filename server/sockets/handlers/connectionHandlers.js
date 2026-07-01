const User = require("../../models/User");
const Group = require("../../models/Group");
const logger = require("../../utils/logger");
const {
  addOnlineUser,
  removeOnlineUser,
  getOnlineUsers
} = require("../state/onlineUsers");
const markDeliveredForUser = require("../services/markDeliveredForUser");
const { getRelatedUsernames } = require("../../utils/userRelations");

async function getVisibleOnlineUsers(username) {
  const related = await getRelatedUsernames(username);
  const allowed = new Set([username, ...related]);
  return getOnlineUsers().filter(user => allowed.has(user));
}

async function emitPresenceListForUser(io, username) {
  const users = await getVisibleOnlineUsers(username);
  io.to(username).emit("onlineUsers", users);
}

async function emitPresenceLists(io, usernames = []) {
  const unique = [...new Set((usernames || []).filter(Boolean))];

  await Promise.all(
    unique.map(username => emitPresenceListForUser(io, username).catch(() => null))
  );
}

async function handleConnectionStart({ io, socket }) {
  const username = socket.user.username;

  socket.join(username);

  const groups = await Group.find({ members: username }, "_id").lean();
  groups.forEach(group => {
    socket.join(`group:${group._id}`);
  });

  await User.updateOne({ username }, { lastSeen: new Date() });

  logger.debug("socket connected", { username });

  addOnlineUser(username, socket.id);

  const related = await getRelatedUsernames(username);
  await emitPresenceLists(io, [username, ...related]);

  try {
    await markDeliveredForUser({ io, username });
  } catch (err) {
    logger.error("mark delivered failed", err);
  }
}

async function handleConnectionEnd({ io, socket, clearUserTyping }) {
  const username = socket.user.username;

  logger.debug("socket disconnected", { username });

  const related = await getRelatedUsernames(username).catch(() => []);
  const becameOffline = removeOnlineUser(username, socket.id);

  if (becameOffline) {
    const lastSeen = new Date();

    User.updateOne({ username }, { lastSeen })
      .catch(err => logger.error("last seen update failed", err));

    related.forEach(target => {
      io.to(target).emit("userLastSeen", { username, lastSeen });
    });
  }

  clearUserTyping({ io, username });
  await emitPresenceLists(io, [username, ...related]);
}

module.exports = {
  handleConnectionStart,
  handleConnectionEnd,
  emitPresenceListForUser
};
