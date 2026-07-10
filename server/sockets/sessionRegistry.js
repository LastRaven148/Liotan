let socketServer = null;

function configureSessionRegistry(io) {
  socketServer = io;
}

function sessionRoom(sessionIdHash) {
  return `auth-session:${String(sessionIdHash || "")}`;
}

function userRoom(userId) {
  return `auth-user:${String(userId || "")}`;
}

function disconnectSessionHash(sessionIdHash) {
  if (!socketServer || !sessionIdHash) return;
  socketServer.in(sessionRoom(sessionIdHash)).disconnectSockets(true);
}

function disconnectSessionHashes(hashes = []) {
  [...new Set(hashes.filter(Boolean))].forEach(disconnectSessionHash);
}

function disconnectUserId(userId) {
  if (!socketServer || !userId) return;
  socketServer.in(userRoom(userId)).disconnectSockets(true);
}

module.exports = {
  configureSessionRegistry,
  sessionRoom,
  userRoom,
  disconnectSessionHash,
  disconnectSessionHashes,
  disconnectUserId
};
