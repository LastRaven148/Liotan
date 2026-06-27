const Group =
  require("../models/Group");

const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const uploadToCloudinary =
  require("../utils/uploadToCloudinary");

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

async function serializeGroup(group) {

  const data =
    group.toObject
      ? group.toObject()
      : group;

  const users =
    await User.find(
      {
        username: {
          $in: data.members || []
        }
      },
      "username avatar bio lastSeen"
    );

  const sortedUsers =
    (data.members || [])
      .map(username =>
        users.find(user =>
          user.username === username
        )
      )
      .filter(Boolean);

  return {
    ...data,
    memberCount:
      data.members?.length || 0,
    memberUsers:
      sortedUsers
  };

}

function emitGroupUpdated(req, group) {
  const io =
    req.app.get("io");

  if (!io) {
    return;
  }

  io.emit(
    "groupUpdated",
    group
  );
}

function emitGroupDeleted(req, groupId) {
  const io =
    req.app.get("io");

  if (!io) {
    return;
  }

  io.emit(
    "groupDeleted",
    {
      groupId:
        String(groupId)
    }
  );
}

function canManageGroup(
  group,
  username
) {

  return (
    group.owner === username ||
    group.admins.includes(username)
  );

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

    if (description.length > 120) {
      return res.status(400).json({
        error: "invalid description"
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

    if (!validMembers.includes(owner)) {
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

    const serialized =
  await serializeGroup(group);

emitGroupUpdated(
  req,
  serialized
);

res.status(201).json(
  serialized
);

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

    const groups =
      await Group.find({
        members: req.user.username
      }).sort({
        updatedAt: -1
      });

    res.json(
      groups.map(group => ({
        ...group.toObject(),
        memberCount:
          group.members?.length || 0
      }))
    );

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

    if (!group.members.includes(username)) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    const serialized =
  await serializeGroup(group);

emitGroupUpdated(
  req,
  serialized
);

res.json(
  await serializeGroup(group)
);

  } catch (err) {
    next(err);
  }

}

async function updateGroup(
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

    if (!canManageGroup(group, username)) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    const name =
      typeof req.body.name === "string"
        ? req.body.name.trim()
        : group.name;

    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim()
        : group.description;

    if (
      !name ||
      name.length > 40
    ) {
      return res.status(400).json({
        error: "invalid group name"
      });
    }

    if (description.length > 120) {
      return res.status(400).json({
        error: "invalid description"
      });
    }

    group.name =
      name;

    group.description =
      description;

    await group.save();

    const serialized =
  await serializeGroup(group);

emitGroupUpdated(
  req,
  serialized
);

res.json(
  serialized
);

  } catch (err) {
    next(err);
  }

}

async function uploadGroupAvatar(
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

    if (!canManageGroup(group, username)) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "no file"
      });
    }

    await deleteUploadedFile({
      url: group.avatar,
      publicId: group.avatarPublicId,
      resourceType: group.avatarResourceType
    });

    const result =
      await uploadToCloudinary(
        req.file,
        {
          folder: "liotan/groups",
          resourceType: "image"
        }
      );

    group.avatar =
      result.secure_url;

    group.avatarPublicId =
      result.public_id;

    group.avatarResourceType =
      result.resource_type;

    await group.save();

    const serialized =
  await serializeGroup(group);

emitGroupUpdated(
  req,
  serialized
);

res.json(
  serialized
);

  } catch (err) {
    next(err);
  }

}

async function addGroupMember(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const member =
      String(req.body.username || "").trim();

    if (!isValidUsername(member)) {
      return res.status(400).json({
        error: "invalid username"
      });
    }

    const group =
      await Group.findById(
        req.params.id
      );

    if (!group) {
      return res.status(404).json({
        error: "group not found"
      });
    }

    if (!canManageGroup(group, username)) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    const userExists =
      await User.exists({
        username: member
      });

    if (!userExists) {
      return res.status(404).json({
        error: "user not found"
      });
    }

    if (!group.members.includes(member)) {
      group.members.push(member);
      await group.save();
    }

    const serialized =
  await serializeGroup(group);

emitGroupUpdated(
  req,
  serialized
);

res.json(
  serialized
);

  } catch (err) {
    next(err);
  }

}

async function removeGroupMember(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const member =
      String(req.params.username || "").trim();

    const group =
      await Group.findById(
        req.params.id
      );

    if (!group) {
      return res.status(404).json({
        error: "group not found"
      });
    }

    if (!canManageGroup(group, username)) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    if (member === group.owner) {
      return res.status(400).json({
        error: "cannot remove owner"
      });
    }

    group.members =
      group.members.filter(item =>
        item !== member
      );

    group.admins =
      group.admins.filter(item =>
        item !== member
      );

    await group.save();

    const chatKey =
      `group:${group._id}`;

    await User.updateOne(
      {
        username: member
      },
      {
        $pull: {
          pinnedChats: chatKey,
          archivedChats: chatKey
        }
      }
    );

    const serialized =
  await serializeGroup(group);

emitGroupUpdated(
  req,
  serialized
);

res.json(
  serialized
);

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

    group.members =
      group.members.filter(item =>
        item !== username
      );

    group.admins =
      group.admins.filter(item =>
        item !== username
      );

    await group.save();

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

    const serialized =
  await serializeGroup(group);

emitGroupUpdated(
  req,
  serialized
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
    
    emitGroupDeleted(
  req,
  group._id
);

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
  updateGroup,
  uploadGroupAvatar,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  deleteGroup
};