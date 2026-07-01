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