const Group =
  require("../../../models/Group");

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

const ALLOWED_ATTACHMENT_TYPES = [
  "photo",
  "video",
  "audio",
  "file"
];

function isValidAttachment(
  attachment
) {

  return Boolean(
    attachment &&
    attachment.url &&
    ALLOWED_ATTACHMENT_TYPES.includes(
      attachment.type
    )
  );

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

        const hasText =
          isValidMessage(
            data.text
          );

        const hasAttachment =
          isValidAttachment(
            data.attachment
          );

        if (
          !hasText &&
          !hasAttachment
        ) {
          return;
        }

        const text =
          hasText
            ? data.text.trim()
            : "";

        const replyTo =
          await buildReplyTo({
            replyTo: data.replyTo,
            groupId
          });

        const msg =
          await Message.create({
            chatType: "group",
            chatId: `group:${groupId}`,
            groupId,
            from: sender,
            to: "",
            text,
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
                ? data.attachment
                : undefined
          });

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
          msg
        );

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports =
  registerSendGroupMessage;