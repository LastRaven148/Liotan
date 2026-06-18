function emitToChatUsers({
  io,
  sender,
  receiver,
  event,
  payload
}) {

  if (sender === receiver) {
    io.to(sender).emit(
      event,
      payload
    );

    return;
  }

  io.to(sender).emit(
    event,
    payload
  );

  io.to(receiver).emit(
    event,
    payload
  );

}

module.exports =
  emitToChatUsers;