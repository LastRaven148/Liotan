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
    async (data, ack) => {

      const reply = typeof ack === "function" ? ack : () => {};

      try {

        const sender =
          socket.user.username;

        const receiver =
          data.to;

        const encryptedContent =
          normalizeEncryptedContent(data.encryptedContent);

        const hasEncryptedContent =
          Boolean(encryptedContent);

        const hasText = false;

        const safeAttachment =
          await resolveOwnedAttachment(
            data.attachment,
            sender
          );

        const hasAttachment =
          Boolean(safeAttachment);

        const chatId = getChatId(sender, receiver);
        const envelopeMatches = !hasEncryptedContent || (
          encryptedContent.sender === sender &&
          encryptedContent.kid === chatId
        );
        const mediaMatches = !hasAttachment || (
          safeAttachment.e2eeMedia?.sender === sender &&
          safeAttachment.e2eeMedia?.kid === chatId
        );

        if (
          !isValidUsername(receiver) ||
          (
            !hasText &&
            !hasAttachment &&
            !hasEncryptedContent
          ) || !envelopeMatches || !mediaMatches || Boolean(String(data.text || "").trim()) && !hasEncryptedContent
        ) {
          reply({ ok: false, error: "e2ee-v3-required" });
          return;
        }

        const receiverExists =
          await User.exists({
            username: receiver,
            emailVerified: true
          });

        if (!receiverExists) {
          reply({ ok: false, error: "receiver-not-found" });
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

        const contentMode = "e2ee";

        const isSavedMessages =
          sender === receiver;

        const receiverOnline =
          isUserOnline(receiver);

        const now =
          new Date();

        const replyTo =
          await buildReplyTo({
            replyTo: data.replyTo,
            currentContentMode: contentMode,
            chatId
          });

        if (hasEncryptedContent) {
          const duplicate = await Message.exists({
            from: sender,
            "encryptedContent.nonce": encryptedContent.nonce
          });

          if (duplicate) {
            reply({ ok: true, duplicate: true });
            return;
          }
        }
        if (hasAttachment) {
          const duplicateMedia = await Message.exists({
            from: sender,
            "attachment.e2eeMedia.nonce": safeAttachment.e2eeMedia.nonce
          });
          if (duplicateMedia) {
            reply({ ok: true, duplicate: true });
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

        const payload = serializeMessage(msg);

        emitToChatUsers({
          io,
          sender,
          receiver,
          event: "newMessage",
          payload
        });

        reply({ ok: true, message: payload });

      } catch (err) {
        logger.error("send private message failed", err);
        reply({ ok: false, error: "send-failed" });
      }

    }
  );

}

module.exports =
  registerSendPrivateMessage;
