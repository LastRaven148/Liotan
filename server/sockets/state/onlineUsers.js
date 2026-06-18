const onlineUsers =
  new Map();

function addOnlineUser(
  username,
  socketId
) {

  if (!onlineUsers.has(username)) {
    onlineUsers.set(
      username,
      new Set()
    );
  }

  onlineUsers
    .get(username)
    .add(socketId);

}

function removeOnlineUser(
  username,
  socketId
) {

  const sockets =
    onlineUsers.get(username);

  if (!sockets) {
    return false;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(username);
    return true;
  }

  return false;

}

function isUserOnline(username) {

  return onlineUsers.has(username);

}

function getOnlineUsers() {

  return [
    ...onlineUsers.keys()
  ];

}

module.exports = {
  onlineUsers,
  addOnlineUser,
  removeOnlineUser,
  isUserOnline,
  getOnlineUsers
};