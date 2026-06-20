const Group =
  require("../models/Group");

const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const deleteUploadedFile =
  require("../utils/deleteUploadedFile");

const {
  isValidUsername
} = require("../utils/validators");

function normalizeMembers(
  members,
  owner
) {

  const list =
    Array.isArray(members)
      ? members
      : [];

  return [
    ...new Set([
      owner,
      ...list.filter(isValidUsername)
    ])
  ];

}

async function deleteGroupMessageFiles(
  messages
) {

  for (const message of messages) {
    await deleteUploadedFile({
      url:
        message.attachment?.url,
      publicId:
        message.attachment?.publicId,
      resourceType:
        message.attachment?.resourceType
    });
  }

}

async function createGroup(
  req,
  res,
  next
) {

  try {

    const owner =
      req.user.username;

    const name =
      typeof req.body.name === "string"
        ? req.body.name.trim()
        : "";

    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim()
        : "";

    if (
      !name ||
      name.length > 40
    ) {
      return res.status(400).json({
        error: "invalid group name"
      });
    }

    const members =
      normalizeMembers(
        req.body.members,
        owner
      );

    const existingUsers =
      await User.find(
        {
          username: {
            $in: members
          }
        },
        "username"
      );

    const validMembers =
      existingUsers.map(
        user => user.username
      );

    if (
      !validMembers.includes(owner)
    ) {
      validMembers.push(owner);
    }

    const group =
      await Group.create({
        name,
        description,
        owner,
        admins: [owner],
        members: validMembers
      });

    res.status(201).json(group);

  } catch (err) {
    next(err);
  }

}

async function getMyGroups(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const groups =
      await Group.find({
        members: username
      }).sort({
        updatedAt: -1
      });

    res.json(groups);

  } catch (err) {
    next(err);
  }

}

async function getGroupById(
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

    res.json(group);

  } catch (err) {
    next(err);
  }

}

async function leaveGroup(
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

    if (group.owner === username) {
      return res.status(400).json({
        error: "owner must delete group"
      });
    }

    await Group.updateOne(
      {
        _id: group._id
      },
      {
        $pull: {
          members: username,
          admins: username
        }
      }
    );

    const chatKey =
      `group:${group._id}`;

    await User.updateOne(
      {
        username
      },
      {
        $pull: {
          pinnedChats: chatKey,
          archivedChats: chatKey
        }
      }
    );

    res.json({
      ok: true
    });

  } catch (err) {
    next(err);
  }

}

async function deleteGroup(
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

    if (group.owner !== username) {
      return res.status(403).json({
        error: "only owner can delete group"
      });
    }

    const messages =
      await Message.find({
        chatType: "group",
        groupId: group._id
      });

    await deleteGroupMessageFiles(
      messages
    );

    await Message.deleteMany({
      chatType: "group",
      groupId: group._id
    });

    await deleteUploadedFile({
      url: group.avatar,
      publicId: group.avatarPublicId,
      resourceType: group.avatarResourceType
    });

    const chatKey =
      `group:${group._id}`;

    await User.updateMany(
      {},
      {
        $pull: {
          pinnedChats: chatKey,
          archivedChats: chatKey
        }
      }
    );

    await Group.deleteOne({
      _id: group._id
    });

    res.json({
      ok: true
    });

  } catch (err) {
    next(err);
  }

}

module.exports = {
  createGroup,
  getMyGroups,
  getGroupById,
  leaveGroup,
  deleteGroup
};