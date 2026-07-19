const Group = require("../models/Group");
const User = require("../models/User");
const Message = require("../models/Messages");
const E2EEKey = require("../models/E2EEKey");
const CryptoConversation = require("../models/CryptoConversation");
const CryptoEvent = require("../models/CryptoEvent");
const CryptoOperation = require("../models/CryptoOperation");
const CryptoDevice = require("../models/CryptoDevice");
const AttachmentUpload = require("../models/AttachmentUpload");
const { uploadToR2 } = require("../utils/uploadToR2");
const { buildSanitizedAvatarFile } = require("../utils/avatarProcessing");
const deleteUploadedFile = require("../utils/deleteUploadedFile");
const { messagesMediaKeys } = require("../sockets/services/mediaKeys");
const { transitionConversationRoster } = require("../security/cryptoRosterState");
const {
  normalizeMime,
  assertAllowedAvatar,
  assertSafeFileBuffer
} = require("../middleware/uploadSecurity");
const {
  isValidUsername
} = require("../utils/validators");

const emitToGroupMembers =
  require("../sockets/services/emitToGroupMembers");
const MAX_GROUP_MEMBERS = Math.min(500, Math.max(2, Number(process.env.MAX_GROUP_MEMBERS) || 100));
function withAvatarCacheBust(url) {
  if (!url) return "";
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}

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

function emitGroupDeleted(req, group, deletedMediaKeys = []) {
  const io = req.app.get("io");
  if (!io) {
    return;
  }

  emitToGroupMembers({
    io,
    members: group.members || [],
    event: "groupDeleted",
    payload: {
      groupId: String(group._id),
      deletedMediaKeys
    }
  });
}
function canManageGroup(group, username) {
  return group.owner === username || group.admins.includes(username);
}
async function blockMlsGroup(groupId, {
  addClientIds = [],
  removeClientIds = [],
  reason = "group membership changed"
} = {}) {
  await transitionConversationRoster(
    { lookupKey: `group:${groupId}` },
    { addClientIds, removeClientIds, reason }
  );
}
async function activeCryptoClientIds(username) {
  const devices = await CryptoDevice.find({
    username,
    status: "active",
    manifestExpiresAt: { $gt: new Date() }
  }, "clientId").lean();
  return devices.map(device => device.clientId);
}
async function deleteGroupMessageFiles(messages) {
  for (const message of messages) {
    await deleteUploadedFile({
      url: message.attachment?.url,
      storageKey: message.attachment?.storageKey,
      storageType: message.attachment?.storageType,
      uploadId: message.attachment?.uploadId,
      mediaId: message.attachment?.mediaId
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
    if (members.length > MAX_GROUP_MEMBERS) {
      return res.status(400).json({ error: "group member limit exceeded" });
    }
    const existingUsers = await User.find({
      username: {
        $in: members
      },
      lifecycleState: { $ne: "deleting" }
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
      members: req.user.username,
      lifecycleState: { $ne: "deleting" }
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
    const group = await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
    const group = await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
    const group = await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
    const mimeType = normalizeMime(req.file.mimetype);
    assertAllowedAvatar({
      mimeType,
      fileName: req.file.originalname,
      size: req.file.size
    });
    assertSafeFileBuffer({
      buffer: req.file.buffer,
      mimeType
    });

    const oldAvatar = {
      url: group.avatar,
      storageKey: group.avatarStorageKey,
      storageType: group.avatarStorageType
    };
    const sanitizedAvatar = buildSanitizedAvatarFile(req.file, mimeType);
    const result = await uploadToR2(sanitizedAvatar, {
      folder: "liotan/groups",
      mimeType,
      storageClass: "public-avatar"
    });
    group.avatar = withAvatarCacheBust(result.url);
    group.avatarStorageKey = result.key;
    group.avatarStorageType = result.storageType;
    await group.save();
    await deleteUploadedFile(oldAvatar);
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
    const group = await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
      emailVerified: true,
      lifecycleState: { $ne: "deleting" }
    });
    if (!userExists) {
      return res.status(404).json({
        error: "user not found"
      });
    }
    if (!group.members.includes(member)) {
      if (group.members.length >= MAX_GROUP_MEMBERS) {
        return res.status(409).json({ error: "group member limit reached" });
      }
      await blockMlsGroup(group._id, {
        addClientIds: await activeCryptoClientIds(member),
        reason: "group member added"
      });
      group.members.push(member);
      group.e2eeVersion = (Number(group.e2eeVersion) || 1) + 1;
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
    const group = await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
    if (!group.members.includes(member)) {
      return res.status(404).json({ error: "group member not found" });
    }
    await blockMlsGroup(group._id, {
      removeClientIds: await activeCryptoClientIds(member),
      reason: "group member removed"
    });
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
    // Historical epoch wrappers are intentionally retained for remaining
    // members. The removed member is excluded from the new epoch.
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
    const group = await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
    await blockMlsGroup(group._id, {
      removeClientIds: await activeCryptoClientIds(username),
      reason: "group member left"
    });
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
    // Do not destroy historical epochs. A new epoch is created above and the
    // leaving member will not receive its wrappers.
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
    const group = await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
    const deletedMediaKeys = messagesMediaKeys(messages);

    await deleteGroupMessageFiles(messages);
    await Message.deleteMany({
      chatType: "group",
      groupId: group._id
    });
    await deleteUploadedFile({
      url: group.avatar,
      storageKey: group.avatarStorageKey,
      storageType: group.avatarStorageType
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
    const cryptoConversation = await CryptoConversation.findOne({ lookupKey: `group:${group._id}` }).lean();
    if (cryptoConversation) {
      const uploads = await AttachmentUpload.find({ cryptoConversationId: cryptoConversation.conversationId }).lean();
      for (const upload of uploads) {
        await deleteUploadedFile({ storageKey: upload.storageKey, storageType: upload.storageType });
      }
      await Promise.all([
        AttachmentUpload.deleteMany({ cryptoConversationId: cryptoConversation.conversationId }),
        CryptoEvent.deleteMany({ conversationId: cryptoConversation.conversationId }),
        CryptoOperation.deleteMany({ conversationId: cryptoConversation.conversationId }),
        CryptoConversation.deleteOne({ _id: cryptoConversation._id })
      ]);
    }
    emitGroupDeleted(req, group, deletedMediaKeys);
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
