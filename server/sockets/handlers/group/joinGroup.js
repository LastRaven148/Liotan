const Group =
  require("../../../models/Group");

function getGroupRoom(
  groupId
) {

  return `group:${groupId}`;
}

function registerJoinGroup({
  socket
}) {

  socket.on(
    "joinGroup",
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

        socket.join(
          getGroupRoom(groupId)
        );

      } catch (err) {
        console.error(err);
      }

    }
  );

}

module.exports = {
  registerJoinGroup,
  getGroupRoom
};