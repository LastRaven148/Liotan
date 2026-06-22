const Message =
  require("../../../models/Messages");

const Group =
  require("../../../models/Group");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

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

          const group =
            await Group.findById(
              msg.groupId
            );

          if (
            !group ||
            !group.members.includes(username)
          ) {
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

        const isParticipant =
          msg.from === username ||
          msg.to === username;

        if (!isParticipant) {
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
        console.error(err);
      }

    }
  );

}

module.exports =
  registerPinMessage;