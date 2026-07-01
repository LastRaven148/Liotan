const Group =
  require("../../../models/Group");

const logger =
  require("../../../utils/logger");

const Message =
  require("../../../models/Messages");

const {
  isValidMessage
} = require("../../../utils/validators");

const buildReplyTo =
  require("../../services/buildReplyTo");

const {
  getGroupRoom
} = require("./joinGroup");

const {
  resolveOwnedAttachment,
  markAttachmentUploadUsed
} = require("../../../services/attachmentOwnership");

const {
  serializeMessage
} = require("../../services/serializeMessage");

function isValidEncryptedContent(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.ciphertext === "string" &&
    value.ciphertext.length > 0 &&
    value.ciphertext.length <= 100000 &&
    typeof value.iv === "string" &&
    value.iv.length > 0 &&
    value.iv.length <= 500 &&
    typeof value.salt === "string" &&
    value.salt.length > 0 &&
    value.salt.length <= 500 &&
    typeof value.nonce === "string" &&
    value.nonce.length >= 16 &&
    value.nonce.length <= 200 &&
    typeof value.alg === "string" &&
    value.alg.length > 0 &&
    value.alg.length <= 100
  );
}

function normalizeEncryptedContent(value) {
  if (!isValidEncryptedContent(value)) {
    return null;
  }

  return {
    ciphertext: value.ciphertext,
    iv: value.iv,
    salt: value.salt,
    alg: value.alg,
    kdf: String(value.kdf || "PBKDF2-SHA256").slice(0, 100),
    iter: Number.isFinite(Number(value.iter))
      ? Math.min(1000000, Math.max(1, Math.floor(Number(value.iter))))
      : 200000,
    kid: String(value.kid || "").slice(0, 300),
    nonce: value.nonce,
    version: Number.isFinite(Number(value.version))
      ? Math.max(1, Math.floor(Number(value.version)))
      : 2
  };
}

function registerSendGroupMessage({
  io,
  socket
}) {

  socket.on(
    "sendGroupMessage",
    async (data) => {

      try {

        const sender =
          socket.user.username;

        const groupId =
          data.groupId;

        if (!groupId) {
          return;
        }

        const group =
          await Group.findById(
            groupId
          );

        if (!group) {
          return;
        }

        if (
          !group.members.includes(sender)
        ) {
          return;
        }

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
          !hasText &&
          !hasAttachment &&
          !hasEncryptedContent
        ) {
          return;
        }

        const text =
          hasText
            ? data.text.trim()
            : "";

        const contentMode =
          hasEncryptedContent
            ? "e2ee"
            : "plain";

        const replyTo =
          await buildReplyTo({
            replyTo: data.replyTo,
            groupId
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
            chatType: "group",
            chatId: `group:${groupId}`,
            groupId,
            from: sender,
            to: "",
            contentMode,
            text,
            encryptedContent:
              hasEncryptedContent
                ? encryptedContent
                : undefined,
            replyTo,
            status: "delivered",
            deliveredTo:
              group.members.filter(
                member =>
                  member !== sender
              ),
            readBy: [
              sender
            ],
            deliveredAt:
              new Date(),
            attachment:
              hasAttachment
                ? safeAttachment
                : undefined
          });

        if (hasAttachment) {
          await markAttachmentUploadUsed(data.attachment, sender);
        }

        await Group.updateOne(
          {
            _id: groupId
          },
          {
            updatedAt: new Date()
          }
        );

        io.to(
          getGroupRoom(groupId)
        ).emit(
          "newMessage",
          serializeMessage(msg)
        );

      } catch (err) {
        logger.error("send group message failed", err);
      }

    }
  );

}

module.exports =
  registerSendGroupMessage;