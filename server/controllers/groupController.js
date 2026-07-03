const Group = require("../models/Group");
const User = require("../models/User");
const Message = require("../models/Messages");
const E2EEKey = require("../models/E2EEKey");
const { uploadToR2 } = require("../utils/uploadToR2");
const deleteUploadedFile = require("../utils/deleteUploadedFile");
const {
  isValidUsername
} = require("../utils/validators");

const emitToGroupMembers =
  require("../sockets/services/emitToGroupMembers");
function normalizeMembers(members, owner) {
  const list = Array.isArray(members) ? members : [];
  return [...new Set([owner, ...list.filter(isValidUsername)])];
}
function sanitizeGroupUser(user, { detailed = false } = {}) {
  return {
    username: user.username,
    displayName: user.displayName || "",
    avatar: detailed ? user.avatar || "" : "",
    bio: detailed ? user.bio || "" : "",
    lastSeen: detailed ? user.lastSeen || null : null
  };
}

async function serializeGroup(group, { detailed = true } = {}) {
  const data =
    group.toObject ? group.toObject() : group;

  const users =
    await User.find({
      username: {
        $in: data.members || []
      }
    }, "username displayName avatar bio lastSeen").lean();

  const sortedUsers =
    (data.members || [])
      .map(username => users.find(user => user.username === username))
      .filter(Boolean)
      .map(user => sanitizeGroupUser(user, { detailed }));

  return {
    _id: data._id,
    name: data.name || "",
    description: data.description || "",
    avatar: data.avatar || "",
    owner: data.owner || "",
    admins: data.admins || [],
    members: data.members || [],
    e2eeVersion: data.e2eeVersion || 1,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    memberCount: data.members?.length || 0,
    memberUsers: sortedUsers
  };
}
function emitGroupUpdated(req, group) {
  const io = req.app.get("io");
  if (!io) {
    return;
  }

  emitToGroupMembers({
    io,
    members: group.members || [],
    event: "groupUpdated",
    payload: group
  });
}

function emitGroupDeleted(req, group) {
  const io = req.app.get("io");
  if (!io) {
    return;
  }

  emitToGroupMembers({
    io,
    members: group.members || [],
    event: "groupDeleted",
    payload: {
      groupId: String(group._id)
    }
  });
}
function canManageGroup(group, username) {
  return group.owner === username || group.admins.includes(username);
}
async function deleteGroupMessageFiles(messages) {
  for (const message of messages) {
    await deleteUploadedFile({
      url: message.attachment?.url,
      publicId: message.attachment?.publicId,
      resourceType: message.attachment?.resourceType
    });
  }
}
async function createGroup(req, res, next) {
  try {
    const owner = req.user.username;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    if (!name || name.length > 40) {
      return res.status(400).json({
        error: "invalid group name"
      });
    }
    if (description.length > 120) {
      return res.status(400).json({
        error: "invalid description"
      });
    }
    const members = normalizeMembers(req.body.members, owner);
    const existingUsers = await User.find({
      username: {
        $in: members
      }
    }, "username");
    const validMembers = existingUsers.map(user => user.username);
    if (!validMembers.includes(owner)) {
      validMembers.push(owner);
    }
    const group = await Group.create({
      name,
      description,
      owner,
      admins: [owner],
      members: validMembers
    });
    const serialized = await serializeGroup(group);
    emitGroupUpdated(req, serialized);
    res.status(201).json(serialized);
  } catch (err) {
    next(err);
  }
}
async function getMyGroups(req, res, next) {
  try {
    const groups = await Group.find({
      members: req.user.username
    }).sort({
      updatedAt: -1
    });
    res.json(groups.map(group => ({
      _id: group._id,
      name: group.name || "",
      description: group.description || "",
      avatar: group.avatar || "",
      owner: group.owner || "",
      admins: group.admins || [],
      members: group.members || [],
      e2eeVersion: group.e2eeVersion || 1,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      memberCount: group.members?.length || 0
    })));
  } catch (err) {
    next(err);
  }
}
async function getGroupById(req, res, next) {
  try {
    const username = req.user.username;
    const group = await Group.findById(req.params.id);
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
    res.json(await serializeGroup(group));
  } catch (err) {
    next(err);
  }
}
async function updateGroup(req, res, next) {
  try {
    const username = req.user.username;
    const group = await Group.findById(req.params.id);
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
    const name = typeof req.body.name === "string" ? req.body.name.trim() : group.name;
    const description = typeof req.body.description === "string" ? req.body.description.trim() : group.description;
    if (!name || name.length > 40) {
      return res.status(400).json({
        error: "invalid group name"
      });
    }
    if (description.length > 120) {
      return res.status(400).json({
        error: "invalid description"
      });
    }
    group.name = name;
    group.description = description;
    await group.save();
    const serialized = await serializeGroup(group);
    emitGroupUpdated(req, serialized);
    res.json(serialized);
  } catch (err) {
    next(err);
  }
}
async function uploadGroupAvatar(req, res, next) {
  try {
    const username = req.user.username;
    const group = await Group.findById(req.params.id);
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
    const result = await uploadToR2(req.file, {
      folder: "liotan/groups",
      mimeType: req.file.mimetype
    });
    group.avatar = result.secure_url;
    group.avatarPublicId = result.public_id;
    group.avatarResourceType = result.resource_type;
    await group.save();
    const serialized = await serializeGroup(group);
    emitGroupUpdated(req, serialized);
    res.json(serialized);
  } catch (err) {
    next(err);
  }
}
async function addGroupMember(req, res, next) {
  try {
    const username = req.user.username;
    const member = String(req.body.username || "").trim();
    if (!isValidUsername(member)) {
      return res.status(400).json({
        error: "invalid username"
      });
    }
    const group = await Group.findById(req.params.id);
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
    const userExists = await User.exists({
      username: member,
      emailVerified: true
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
    const serialized = await serializeGroup(group);
    emitGroupUpdated(req, serialized);
    res.json(serialized);
  } catch (err) {
    next(err);
  }
}
async function removeGroupMember(req, res, next) {
  try {
    const username = req.user.username;
    const member = String(req.params.username || "").trim();
    const group = await Group.findById(req.params.id);
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
    group.members = group.members.filter(item => item !== member);
    group.admins = group.admins.filter(item => item !== member);
    group.e2eeVersion = (Number(group.e2eeVersion) || 1) + 1;
    await group.save();
    const chatKey = `group:${group._id}`;
    await User.updateOne({
      username: member
    }, {
      $pull: {
        pinnedChats: chatKey,
        archivedChats: chatKey
      }
    });
    await E2EEKey.deleteMany({
      conversationId: {
        $regex: `^${chatKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?::v\\d+)?$`
      }
    });
    const serialized = await serializeGroup(group);
    emitGroupUpdated(req, serialized);
    res.json(serialized);
  } catch (err) {
    next(err);
  }
}
async function leaveGroup(req, res, next) {
  try {
    const username = req.user.username;
    const group = await Group.findById(req.params.id);
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
    if (group.owner === username) {
      return res.status(400).json({
        error: "owner must delete group"
      });
    }
    group.members = group.members.filter(item => item !== username);
    group.admins = group.admins.filter(item => item !== username);
    group.e2eeVersion = (Number(group.e2eeVersion) || 1) + 1;
    await group.save();
    const chatKey = `group:${group._id}`;
    await User.updateOne({
      username
    }, {
      $pull: {
        pinnedChats: chatKey,
        archivedChats: chatKey
      }
    });
    await E2EEKey.deleteMany({
      conversationId: {
        $regex: `^${chatKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?::v\\d+)?$`
      }
    });
    const serialized = await serializeGroup(group);
    emitGroupUpdated(req, serialized);
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
async function deleteGroup(req, res, next) {
  try {
    const username = req.user.username;
    const group = await Group.findById(req.params.id);
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
    const messages = await Message.find({
      chatType: "group",
      groupId: group._id
    });
    await deleteGroupMessageFiles(messages);
    await Message.deleteMany({
      chatType: "group",
      groupId: group._id
    });
    await deleteUploadedFile({
      url: group.avatar,
      publicId: group.avatarPublicId,
      resourceType: group.avatarResourceType
    });
    const chatKey = `group:${group._id}`;
    await User.updateMany({}, {
      $pull: {
        pinnedChats: chatKey,
        archivedChats: chatKey
      }
    });
    await Group.deleteOne({
      _id: group._id
    });
    await E2EEKey.deleteMany({
      conversationId: {
        $regex: `^${chatKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?::v\\d+)?$`
      }
    });
    emitGroupDeleted(req, group);
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
