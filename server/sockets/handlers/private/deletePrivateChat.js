const Message =
  require("../../../models/Messages");

const getChatId =
  require("../../../utils/getChatId");

const {
  isValidUsername
} = require("../../../utils/validators");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

const deleteMessageAttachments =
  require("../../services/deleteMessageAttachments");

function registerDeletePrivateChat({
  io,
  socket
}) {

  socket.on(
    "deleteChat",
    async ({ user2 }) => {

      try {

        const user1 =
          socket.user.username;

        if (!isValidUsername(user2)) {
          return;
        }

        const chatId =
          getChatId(
            user1,
            user2
          );

        const messages =
          await Message.find({
            chatType: {
              $ne: "group"
            },
            chatId
          });

        if (!messages.length) {
          return;
        }

        await deleteMessageAttachments(
          messages
        );

        await Message.deleteMany({
          chatType: {
            $ne: "group"
          },
          chatId
        });

        emitToChatUsers({
          io,
          sender: user1,
          receiver: user2,
          event: "chatDeleted",
          payload: {
            chatId,
            user1,
            user2
          }
        });

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports =
  registerDeletePrivateChat;