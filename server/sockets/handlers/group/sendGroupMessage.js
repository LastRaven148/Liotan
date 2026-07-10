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

const {
  normalizeEncryptedContent
} = require("../../services/encryptedContent");
function registerSendGroupMessage({
  io,
  socket
}) {

  socket.on(
    "sendGroupMessage",
    async (data, ack) => {

      const reply = typeof ack === "function" ? ack : () => {};

      try {

        const sender =
          socket.user.username;

        const groupId =
          data.groupId;

        if (!groupId) {
          reply({ ok: false, error: "invalid-group" });
          return;
        }

        const group =
          await Group.findById(
            groupId
          );

        if (!group) {
          reply({ ok: false, error: "group-not-found" });
          return;
        }

        if (
          !group.members.includes(sender)
        ) {
          reply({ ok: false, error: "not-member" });
          return;
        }

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

        const epochConversationId = `group:${groupId}:v${Number(group.e2eeVersion) || 1}`;
        const envelopeMatches = !hasEncryptedContent || (
          encryptedContent.sender === sender &&
          encryptedContent.kid === epochConversationId
        );
        const mediaMatches = !hasAttachment || (
          safeAttachment.e2eeMedia?.sender === sender &&
          safeAttachment.e2eeMedia?.kid === epochConversationId
        );

        if (
          !hasText &&
          !hasAttachment &&
          !hasEncryptedContent ||
          !envelopeMatches ||
          !mediaMatches ||
          (Boolean(String(data.text || "").trim()) && !hasEncryptedContent)
        ) {
          reply({ ok: false, error: "e2ee-v3-required" });
          return;
        }

        const text =
          hasText
            ? data.text.trim()
            : "";

        const contentMode = "e2ee";

        const replyTo =
          await buildReplyTo({
            replyTo: data.replyTo,
            currentContentMode: contentMode,
            groupId
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

        const payload = serializeMessage(msg);

        io.to(
          getGroupRoom(groupId)
        ).emit(
          "newMessage",
          payload
        );

        reply({ ok: true, message: payload });

      } catch (err) {
        logger.error("send group message failed", err);
        reply({ ok: false, error: "send-failed" });
      }

    }
  );

}

module.exports =
  registerSendGroupMessage;
