const Message =
  require("../../../models/Messages");

const getChatId =
  require("../../../utils/getChatId");

const {
  isValidUsername
} = require("../../../utils/validators");

function registerGetPrivateChat(socket) {

  socket.on(
    "joinChat",
    (chatId) => {
      const username =
        socket.user.username;

      const raw =
        String(chatId || "");

      const parts =
        raw.split("_");

      if (
        parts.length !== 2 ||
        !parts.includes(username) ||
        !parts.every(isValidUsername)
      ) {
        return;
      }

      const expected =
        getChatId(
          parts[0],
          parts[1]
        );

      if (expected !== raw) {
        return;
      }

      socket.join(raw);
    }
  );

  socket.on(
    "getChat",
    async ({ user2 }) => {

      try {

        if (!isValidUsername(user2)) {
          return;
        }

        const user1 =
          socket.user.username;

        const chatId =
          getChatId(
            user1,
            user2
          );

        const msgs =
          await Message.find({
            chatType: {
              $ne: "group"
            },
            chatId,
            deletedFor: {
              $ne: user1
            }
          }).sort({
            createdAt: 1
          });

        socket.emit(
          "chatHistory",
          {
            chatId,
            msgs
          }
        );

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports =
  registerGetPrivateChat;