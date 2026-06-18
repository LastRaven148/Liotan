const User =
  require("../../models/User");

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

  console.log(
    "CONNECTED:",
    username,
    socket.id
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
    console.error(err);
  }

}

function handleConnectionEnd({
  io,
  socket,
  clearUserTyping
}) {

  const username =
    socket.user.username;

  console.log(
    "DISCONNECTED:",
    username,
    socket.id
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
    ).catch(console.error);

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