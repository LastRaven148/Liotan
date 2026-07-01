const Message =
  require("../../../models/Messages");

const logger =
  require("../../../utils/logger");

const getChatId =
  require("../../../utils/getChatId");

const {
  isValidUsername
} = require("../../../utils/validators");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

function registerMarkPrivateChatRead({
  io,
  socket
}) {

  socket.on(
    "markChatRead",
    async ({ user2 }) => {

      try {

        const reader =
          socket.user.username;

        if (
          !isValidUsername(user2) ||
          reader === user2
        ) {
          return;
        }

        const chatId =
          getChatId(
            reader,
            user2
          );

        const messages =
          await Message.find({
            chatType: {
              $ne: "group"
            },
            chatId,
            from: user2,
            to: reader,
            status: {
              $ne: "read"
            }
          });

        if (!messages.length) {
          return;
        }

        const readAt =
          new Date();

        const messageIds =
          messages.map(
            msg => msg._id.toString()
          );

        await Message.updateMany(
          {
            _id: {
              $in: messageIds
            }
          },
          {
            status: "read",
            readAt,
            deliveredAt: readAt
          }
        );

        emitToChatUsers({
          io,
          sender: user2,
          receiver: reader,
          event: "messageRead",
          payload: {
            chatId,
            messageIds,
            readAt
          }
        });

      } catch (err) {
        logger.error("mark private chat read failed", err);
      }

    }
  );

}

module.exports =
  registerMarkPrivateChatRead;