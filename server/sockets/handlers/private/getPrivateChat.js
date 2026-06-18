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
      socket.join(chatId);
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
            chatId
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