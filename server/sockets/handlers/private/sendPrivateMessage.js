const Message =
  require("../../../models/Messages");

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

        const hasAttachment =
          data.attachment &&
          data.attachment.url &&
          [
            "photo",
            "file"
          ].includes(
            data.attachment.type
          );

        if (
          !isValidUsername(receiver) ||
          (
            !hasText &&
            !hasAttachment
          )
        ) {
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
                ? data.attachment
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