const User =
  require("../models/User");

const Message =
  require("../models/Messages");

async function getDialogs(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const messages =
      await Message.find({
        $or: [
          { from: username },
          { to: username }
        ]
      }).sort({
        createdAt: -1
      });

    const dialogs = [];

    const seen =
      new Set();

    const otherUsernames =
      [];

    for (const msg of messages) {

      const otherUser =
        msg.from === username
          ? msg.to
          : msg.from;

      if (seen.has(otherUser)) {
        continue;
      }

      seen.add(otherUser);

      otherUsernames.push(
        otherUser
      );

      dialogs.push({
        username: otherUser,
        lastMessage:
          msg.text ||
          (
            msg.attachment?.type === "photo"
              ? "Photo"
              : msg.attachment?.type === "file"
                ? msg.attachment.name || "File"
                : ""
          ),
        createdAt: msg.createdAt
      });

    }

    const users =
      await User.find(
        {
          username: {
            $in: otherUsernames
          }
        },
        "username avatar bio lastSeen"
      );

    const usersMap =
      new Map(
        users.map(user => [
          user.username,
          user
        ])
      );

    const result =
      dialogs.map(dialog => {

        const user =
          usersMap.get(
            dialog.username
          );

        return {
          ...dialog,
          avatar:
            user?.avatar || "",
          bio:
            user?.bio || "",
          lastSeen:
            user?.lastSeen || null
        };

      });

    res.json(result);

  } catch (err) {
    next(err);
  }

}

module.exports = {
  getDialogs
};