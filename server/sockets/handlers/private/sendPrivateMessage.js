const Message =
  require("../../../models/Messages");

const logger =
  require("../../../utils/logger");

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
  resolveOwnedAttachment,
  markAttachmentUploadUsed
} = require("../../../services/attachmentOwnership");

const {
  serializeMessage
} = require("../../services/serializeMessage");

const {
  normalizeEncryptedContent
} = require("../../services/encryptedContent");
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

        const encryptedContent =
          normalizeEncryptedContent(data.encryptedContent);

        const hasEncryptedContent =
          Boolean(encryptedContent);

        const hasText =
          !hasEncryptedContent &&
          isValidMessage(
            data.text
          );

        const safeAttachment =
          await resolveOwnedAttachment(
            data.attachment,
            sender
          );

        const hasAttachment =
          Boolean(safeAttachment);

        if (
          !isValidUsername(receiver) ||
          (
            !hasText &&
            !hasAttachment &&
            !hasEncryptedContent
          )
        ) {
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

        const contentMode =
          hasEncryptedContent
            ? "e2ee"
            : "plain";

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

        if (hasEncryptedContent) {
          const duplicate = await Message.exists({
            from: sender,
            "encryptedContent.nonce": encryptedContent.nonce
          });

          if (duplicate) {
            return;
          }
        }

        const msg =
          await Message.create({
            chatType: "private",
            chatId,
            from: sender,
            to: receiver,
            contentMode,
            text,
            encryptedContent:
              hasEncryptedContent
                ? encryptedContent
                : undefined,
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

        if (hasAttachment) {
          await markAttachmentUploadUsed(data.attachment, sender);
        }

        emitToChatUsers({
          io,
          sender,
          receiver,
          event: "newMessage",
          payload: serializeMessage(msg)
        });

      } catch (err) {
        logger.error("send private message failed", err);
      }

    }
  );

}

module.exports =
  registerSendPrivateMessage;