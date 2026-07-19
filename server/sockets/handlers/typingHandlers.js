const { isValidUsername } = require("../../utils/validators");
const User = require("../../models/User");
const { usersAreRelated } = require("../../utils/userRelations");
const { hasBlockBetweenUsernames } = require("../../services/blockPolicy");
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

async function canSendTyping({ from, to }) {
  if (!isValidUsername(to) || !isValidUsername(from) || from === to) return false;

  const [exists, related, blocked] = await Promise.all([
    User.exists({ username: to, emailVerified: true }),
    usersAreRelated(from, to),
    hasBlockBetweenUsernames(from, to)
  ]);

  return Boolean(exists && related && !blocked);
}

function registerTypingHandlers({ io, socket }) {
  socket.on("typing", async ({ to }) => {
    try {
      const from = socket.user.username;
      if (!(await canSendTyping({ from, to }))) return;

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

  socket.on("stopTyping", async ({ to }) => {
    const from = socket.user.username;
    if (!(await canSendTyping({ from, to }).catch(() => false))) return;
    emitStopTyping({ io, from, to });
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
