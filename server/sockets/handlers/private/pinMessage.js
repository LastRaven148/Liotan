const Message =
  require("../../../models/Messages");

const logger =
  require("../../../utils/logger");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

const {
  canPinMessage
} = require("../../../utils/messagePermissions");

function registerPinMessage({
  io,
  socket
}) {

  socket.on(
    "pinMessage",
    async ({ messageId }) => {

      try {

        const username =
          socket.user.username;

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

          if (!(await canPinMessage({
            username,
            message: msg
          }))) {
            return;
          }

          msg.isPinned =
            !msg.isPinned;

          msg.pinnedAt =
            msg.isPinned
              ? new Date()
              : null;

          msg.pinnedBy =
            msg.isPinned
              ? username
              : "";

          await msg.save();

          io.to(`group:${msg.groupId}`).emit(
            "messagePinned",
            msg
          );

          return;
        }

        if (!(await canPinMessage({
          username,
          message: msg
        }))) {
          return;
        }

        msg.isPinned =
          !msg.isPinned;

        msg.pinnedAt =
          msg.isPinned
            ? new Date()
            : null;

        msg.pinnedBy =
          msg.isPinned
            ? username
            : "";

        await msg.save();

        emitToChatUsers({
          io,
          sender: msg.from,
          receiver: msg.to,
          event: "messagePinned",
          payload: msg
        });

      } catch (err) {
        logger.error("pin message failed", err);
      }

    }
  );

}

module.exports =
  registerPinMessage;