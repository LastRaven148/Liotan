const Message =
  require("../../../models/Messages");

const {
  isValidMessage
} = require("../../../utils/validators");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

function registerEditMessage({
  io,
  socket
}) {

  socket.on(
    "editMessage",
    async (data) => {

      try {

        const sender =
          socket.user.username;

        const messageId =
          data.messageId;

        if (
          !messageId ||
          !isValidMessage(data.text)
        ) {
          return;
        }

        const msg =
          await Message.findById(
            messageId
          );

        if (
          !msg ||
          msg.from !== sender
        ) {
          return;
        }

        msg.text =
          data.text.trim();

        msg.edited =
          true;

        msg.editedAt =
          new Date();

        await msg.save();

        if (msg.chatType === "group") {
          io.to(`group:${msg.groupId}`).emit(
            "messageEdited",
            msg
          );

          return;
        }

        emitToChatUsers({
          io,
          sender: msg.from,
          receiver: msg.to,
          event: "messageEdited",
          payload: msg
        });

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports =
  registerEditMessage;