const Message =
  require("../../../models/Messages");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

const deleteAttachmentFile =
  require("../../services/deleteAttachmentFile");

function registerDeleteMessage({
  io,
  socket
}) {

  socket.on(
    "deleteMessage",
    async (data) => {

      try {

        const requester =
          socket.user.username;

        const messageId =
          data.messageId;

        if (!messageId) {
          return;
        }

        const msg =
          await Message.findById(
            messageId
          );

        if (!msg) {
          return;
        }

        if (msg.chatType === "group") {

          await deleteAttachmentFile(
            msg.attachment
          );

          await Message.deleteOne({
            _id: messageId
          });

          const latestMessage =
            await Message.findOne({
              chatType: "group",
              groupId: msg.groupId
            }).sort({
              createdAt: -1
            });

          io.to(`group:${msg.groupId}`).emit(
            "messageDeleted",
            {
              chatId: `group:${msg.groupId}`,
              groupId:
                msg.groupId,
              messageId:
                messageId.toString(),
              deletedMessage: msg,
              latestMessage
            }
          );

          return;
        }

        const isParticipant =
          msg.from === requester ||
          msg.to === requester;

        if (!isParticipant) {
          return;
        }

        await deleteAttachmentFile(
          msg.attachment
        );

        await Message.deleteOne({
          _id: messageId
        });

        const latestMessage =
          await Message.findOne({
            chatType: {
              $ne: "group"
            },
            chatId: msg.chatId
          }).sort({
            createdAt: -1
          });

        emitToChatUsers({
          io,
          sender: msg.from,
          receiver: msg.to,
          event: "messageDeleted",
          payload: {
            chatId: msg.chatId,
            messageId:
              messageId.toString(),
            deletedMessage: msg,
            latestMessage
          }
        });

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports =
  registerDeleteMessage;