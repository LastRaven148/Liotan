const User =
  require("../../models/User");

const logger =
  require("../../utils/logger");

const {
  addOnlineUser,
  removeOnlineUser,
  getOnlineUsers
} = require("../state/onlineUsers");

const markDeliveredForUser =
  require("../services/markDeliveredForUser");

async function handleConnectionStart({
  io,
  socket
}) {

  const username =
    socket.user.username;

  socket.join(username);

  await User.updateOne(
    {
      username
    },
    {
      lastSeen: new Date()
    }
  );

  logger.debug(
    "socket connected",
    { username }
  );

  addOnlineUser(
    username,
    socket.id
  );

  io.emit(
    "onlineUsers",
    getOnlineUsers()
  );

  try {

    await markDeliveredForUser({
      io,
      username
    });

  } catch (err) {
    logger.error("mark delivered failed", err);
  }

}

function handleConnectionEnd({
  io,
  socket,
  clearUserTyping
}) {

  const username =
    socket.user.username;

  logger.debug(
    "socket disconnected",
    { username }
  );

  const becameOffline =
    removeOnlineUser(
      username,
      socket.id
    );

  if (becameOffline) {

    const lastSeen =
      new Date();

    User.updateOne(
      {
        username
      },
      {
        lastSeen
      }
).catch(err => logger.error("last seen update failed", err));

    io.emit(
      "userLastSeen",
      {
        username,
        lastSeen
      }
    );

  }

  clearUserTyping({
    io,
    username
  });

  io.emit(
    "onlineUsers",
    getOnlineUsers()
  );

}

module.exports = {
  handleConnectionStart,
  handleConnectionEnd
};