const { isValidUsername } = require("../../utils/validators");
const User = require("../../models/User");
const {
  typingTimers,
  getTypingKey,
  setTypingTimer,
  clearTypingTimer,
  deleteTypingTimerByKey
} = require("../state/typingTimers");

function emitStopTyping({ io, from, to }) {
  if (!isValidUsername(to) || !isValidUsername(from) || from === to) return;
  clearTypingTimer(from, to);
  io.to(to).emit("userStoppedTyping", { from });
}

function registerTypingHandlers({ io, socket }) {
  socket.on("typing", async ({ to }) => {
    try {
      const from = socket.user.username;
      if (!isValidUsername(to) || from === to) return;

      const exists = await User.exists({ username: to, emailVerified: true });
      if (!exists) return;

      const key = getTypingKey(from, to);
      clearTypingTimer(from, to);
      io.to(to).emit("userTyping", { from });

      const timer = setTimeout(() => {
        typingTimers.delete(key);
        io.to(to).emit("userStoppedTyping", { from });
      }, 2500);

      setTypingTimer(from, to, timer);
    } catch {}
  });

  socket.on("stopTyping", ({ to }) => {
    emitStopTyping({ io, from: socket.user.username, to });
  });
}

function clearUserTyping({ io, username }) {
  for (const key of typingTimers.keys()) {
    if (key.startsWith(`${username}->`)) {
      const to = key.split("->")[1];
      deleteTypingTimerByKey(key);
      io.to(to).emit("userStoppedTyping", { from: username });
    }
  }
}

module.exports = {
  registerTypingHandlers,
  emitStopTyping,
  clearUserTyping
};
