const Message =
  require("../../../models/Messages");

const User =
  require("../../../models/User");

const getChatId =
  require("../../../utils/getChatId");

const {
  isValidUsername,
  isValidMessage
} = require("../../../utils/validators");

const buildReplyTo =
  require("../../services/buildReplyTo");

const emitToChatUsers =
  require("../../services/emitToChatUsers");

const {
  isUserOnline
} = require("../../state/onlineUsers");

const {
  sanitizeAttachment
} = require("../../../utils/attachmentSecurity");

function registerSendPrivateMessage({
  io,
  socket,
  emitStopTyping
}) {

  socket.on(
    "sendMessage",
    async (data) => {

      try {

        const sender =
          socket.user.username;

        const receiver =
          data.to;

        const hasText =
          isValidMessage(
            data.text
          );

        const safeAttachment =
          sanitizeAttachment(
            data.attachment
          );

        const hasAttachment =
          Boolean(safeAttachment);

        if (
          !isValidUsername(receiver) ||
          (
            !hasText &&
            !hasAttachment
          )
        ) {
          return;
        }

        if (receiver === sender) {
          return;
        }

        const receiverExists =
          await User.exists({
            username: receiver,
            emailVerified: true
          });

        if (!receiverExists) {
          return;
        }

        emitStopTyping({
          io,
          from: sender,
          to: receiver
        });

        const text =
          hasText
            ? data.text.trim()
            : "";

        const chatId =
          getChatId(
            sender,
            receiver
          );

        const isSavedMessages =
          sender === receiver;

        const receiverOnline =
          isUserOnline(receiver);

        const now =
          new Date();

        const replyTo =
          await buildReplyTo({
            replyTo: data.replyTo,
            chatId
          });

        const msg =
          await Message.create({
            chatType: "private",
            chatId,
            from: sender,
            to: receiver,
            text,
            replyTo,
            status:
              isSavedMessages
                ? "read"
                : receiverOnline
                  ? "delivered"
                  : "sent",
            deliveredAt:
              isSavedMessages ||
              receiverOnline
                ? now
                : null,
            readAt:
              isSavedMessages
                ? now
                : null,
            attachment:
              hasAttachment
                ? safeAttachment
                : undefined
          });

        emitToChatUsers({
          io,
          sender,
          receiver,
          event: "newMessage",
          payload: msg
        });

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports =
  registerSendPrivateMessage;