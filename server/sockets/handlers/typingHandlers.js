const {
  isValidUsername
} = require("../../utils/validators");

const {
  typingTimers,
  getTypingKey,
  setTypingTimer,
  clearTypingTimer,
  deleteTypingTimerByKey
} = require("../state/typingTimers");

function emitStopTyping({
  io,
  from,
  to
}) {

  clearTypingTimer(
    from,
    to
  );

  io.to(to).emit(
    "userStoppedTyping",
    {
      from
    }
  );

}

function registerTypingHandlers({
  io,
  socket
}) {

  socket.on(
    "typing",
    ({ to }) => {

      const from =
        socket.user.username;

      if (
        !isValidUsername(to) ||
        from === to
      ) {
        return;
      }

      const key =
        getTypingKey(
          from,
          to
        );

      clearTypingTimer(
        from,
        to
      );

      io.to(to).emit(
        "userTyping",
        {
          from
        }
      );

      const timer =
        setTimeout(
          () => {

            typingTimers.delete(key);

            io.to(to).emit(
              "userStoppedTyping",
              {
                from
              }
            );

          },
          2500
        );

      setTypingTimer(
        from,
        to,
        timer
      );

    }
  );

  socket.on(
    "stopTyping",
    ({ to }) => {

      const from =
        socket.user.username;

      if (
        !isValidUsername(to) ||
        from === to
      ) {
        return;
      }

      emitStopTyping({
        io,
        from,
        to
      });

    }
  );

}

function clearUserTyping({
  io,
  username
}) {

  for (const key of typingTimers.keys()) {

    if (key.startsWith(`${username}->`)) {

      const to =
        key.split("->")[1];

      deleteTypingTimerByKey(key);

      io.to(to).emit(
        "userStoppedTyping",
        {
          from: username
        }
      );

    }

  }

}

module.exports = {
  registerTypingHandlers,
  emitStopTyping,
  clearUserTyping
};