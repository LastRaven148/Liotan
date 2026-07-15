const getChatId = require("../../../utils/getChatId");
const { getPrivateChatParticipants } = getChatId;
const { isValidUsername } = require("../../../utils/validators");

function registerGetPrivateChat(socket) {
  socket.on("joinChat", (chatId) => {
    const username = socket.user.username;
    const raw = String(chatId || "");
    const parts = getPrivateChatParticipants(raw);

    if (parts.length !== 2 || !parts.includes(username) || !parts.every(isValidUsername)) return;

    const expected = getChatId(parts[0], parts[1]);
    if (expected !== raw) return;

    socket.join(raw);
  });

  socket.on("getChat", (_payload, ack) => {
    if (typeof ack === "function") ack({
      ok: false,
      error: "mls-v4-required",
      protocol: "mls-1.0"
    });
  });
}

module.exports = registerGetPrivateChat;
