const Message =
  require("../../../models/Messages");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

const deleteAttachmentFile =
  require("../../services/deleteAttachmentFile");

const {
  canAccessMessage,
  canDeleteForEveryone
} = require("../../../utils/messagePermissions");

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

        const forEveryone =
          Boolean(data.forEveryone);

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

        if (!(await canAccessMessage({
          username: requester,
          message: msg
        }))) {
          return;
        }

        if (msg.chatType === "group") {

          const groupChatId =
            msg.chatId ||
            `group:${msg.groupId}`;

          if (!forEveryone) {
            await Message.updateOne(
              {
                _id: messageId
              },
              {
                $addToSet: {
                  deletedFor: requester
                }
              }
            );

            const latestMessage =
              await Message.findOne({
                chatType: "group",
                groupId: msg.groupId,
                deletedFor: {
                  $ne: requester
                }
              }).sort({
                createdAt: -1
              });

            socket.emit(
              "messageDeleted",
              {
                chatId: groupChatId,
                groupId:
                  msg.groupId,
                messageId:
                  messageId.toString(),
                deletedMessage: msg,
                latestMessage,
                forUserOnly: true
              }
            );

            return;
          }

          if (!(await canDeleteForEveryone({
            username: requester,
            message: msg
          }))) {
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
              chatType: "group",
              groupId: msg.groupId
            }).sort({
              createdAt: -1
            });

          io.to(`group:${msg.groupId}`).emit(
            "messageDeleted",
            {
              chatId: groupChatId,
              groupId:
                msg.groupId,
              messageId:
                messageId.toString(),
              deletedMessage: msg,
              latestMessage,
              forEveryone: true
            }
          );

          return;
        }

        if (!forEveryone) {
          await Message.updateOne(
            {
              _id: messageId
            },
            {
              $addToSet: {
                deletedFor: requester
              }
            }
          );

          const latestMessage =
            await Message.findOne({
              chatType: {
                $ne: "group"
              },
              chatId: msg.chatId,
              deletedFor: {
                $ne: requester
              }
            }).sort({
              createdAt: -1
            });

          socket.emit(
            "messageDeleted",
            {
              chatId: msg.chatId,
              messageId:
                messageId.toString(),
              deletedMessage: msg,
              latestMessage,
              forUserOnly: true
            }
          );

          return;
        }

        if (!(await canDeleteForEveryone({
          username: requester,
          message: msg
        }))) {
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
            latestMessage,
            forEveryone: true
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