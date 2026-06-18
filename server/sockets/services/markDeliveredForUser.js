const Message =
  require("../../models/Messages");

const emitToChatUsers =
  require("./emitToChatUsers");

async function markDeliveredForUser({
  io,
  username
}) {

  const messages =
    await Message.find({
      chatType: {
        $ne: "group"
      },
      to: username,
      from: {
        $ne: username
      },
      $or: [
        { status: "sent" },
        {
          status: {
            $exists: false
          }
        }
      ]
    });

  if (!messages.length) {
    return;
  }

  const deliveredAt =
    new Date();

  await Message.updateMany(
    {
      _id: {
        $in:
          messages.map(
            msg => msg._id
          )
      }
    },
    {
      status: "delivered",
      deliveredAt
    }
  );

  for (const msg of messages) {

    emitToChatUsers({
      io,
      sender: msg.from,
      receiver: msg.to,
      event: "messageDelivered",
      payload: {
        chatId: msg.chatId,
        messageIds: [
          msg._id.toString()
        ],
        deliveredAt
      }
    });

  }

}

module.exports =
  markDeliveredForUser;