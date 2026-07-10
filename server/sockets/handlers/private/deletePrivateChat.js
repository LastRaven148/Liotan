const Message =
  require("../../../models/Messages");

const logger =
  require("../../../utils/logger");

const getChatId =
  require("../../../utils/getChatId");
const { getLegacyChatId } = getChatId;

const {
  isValidUsername
} = require("../../../utils/validators");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

const deleteMessageAttachments =
  require("../../services/deleteMessageAttachments");

const E2EEKey =
  require("../../../models/E2EEKey");
const E2EEConversation = require("../../../models/E2EEConversation");

const { messagesMediaKeys } =
  require("../../services/mediaKeys");

function registerDeletePrivateChat({
  io,
  socket
}) {

  socket.on(
    "deleteChat",
    async ({
      user2,
      forEveryone = true
    }) => {

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

        const exactConversation = {
          chatType: { $ne: "group" },
          $or: [
            { chatId },
            {
              chatId: getLegacyChatId(user1, user2),
              $or: [
                { from: user1, to: user2 },
                { from: user2, to: user1 }
              ]
            }
          ]
        };

        if (!forEveryone) {
          const userOnlyMessages =
            await Message.find({
              ...exactConversation,
              deletedFor: {
                $ne: user1
              }
            });

          const deletedMediaKeys =
            messagesMediaKeys(userOnlyMessages);

          await Message.updateMany(
            {
              ...exactConversation
            },
            {
              $addToSet: {
                deletedFor: user1
              }
            }
          );

          socket.emit(
            "chatDeleted",
            {
              chatId,
              user1,
              user2,
              deletedMediaKeys,
              forUserOnly: true
            }
          );

          return;
        }

        const messages =
          await Message.find({
            ...exactConversation
          });

        if (!messages.length) {
          return;
        }

        const deletedMediaKeys =
          messagesMediaKeys(messages);

        await deleteMessageAttachments(
          messages
        );

        await Message.deleteMany({
          ...exactConversation
        });

        await E2EEKey.deleteMany({
          conversationId: chatId
        });
        await E2EEConversation.deleteOne({ conversationId: chatId });

        emitToChatUsers({
          io,
          sender: user1,
          receiver: user2,
          event: "chatDeleted",
          payload: {
            chatId,
            user1,
            user2,
            deletedMediaKeys,
            forEveryone: true
          }
        });

      } catch (err) {
        logger.error("delete private chat failed", err);
      }

    }
  );

}

module.exports =
  registerDeletePrivateChat;
