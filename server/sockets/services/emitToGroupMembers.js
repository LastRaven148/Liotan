function emitToGroupMembers({
  io,
  members = [],
  event,
  payload
}) {
  const uniqueMembers =
    [...new Set((members || []).filter(Boolean))];

  uniqueMembers.forEach(username => {
    io.to(username).emit(
      event,
      payload
    );
  });
}

module.exports =
  emitToGroupMembers;
