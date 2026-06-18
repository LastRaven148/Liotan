const Group =
  require("../../../models/Group");

const Message =
  require("../../../models/Messages");

function registerGetGroupChat({
  socket
}) {

  socket.on(
    "getGroupChat",
    async ({ groupId }) => {

      try {

        const username =
          socket.user.username;

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
          !group.members.includes(username)
        ) {
          return;
        }

        const chatId =
          `group:${groupId}`;

        const msgs =
          await Message.find({
            chatType: "group",
            groupId
          }).sort({
            createdAt: 1
          });

        socket.emit(
          "chatHistory",
          {
            chatId,
            groupId,
            msgs
          }
        );

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports =
  registerGetGroupChat;