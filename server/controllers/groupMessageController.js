const Group =
  require("../models/Group");

const Message =
  require("../models/Messages");

async function getGroupMessages(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const group =
      await Group.findById(
        req.params.id
      );

    if (!group) {
      return res.status(404).json({
        error: "group not found"
      });
    }

    if (
      !group.members.includes(username)
    ) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    const messages =
      await Message.find({
        chatType: "group",
        groupId: group._id
      }).sort({
        createdAt: 1
      });

    res.json(messages);

  } catch (err) {
    next(err);
  }

}

module.exports = {
  getGroupMessages
};