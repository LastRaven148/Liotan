const Group = require("../models/Group");
const User = require("../models/User");
const CryptoDevice = require("../models/CryptoDevice");
const { uploadToR2 } = require("../utils/uploadToR2");
const {
  buildSanitizedAvatarFile,
  assertSafeAvatarDimensions
} = require("../utils/avatarProcessing");
const { replaceAvatar } = require("../services/avatarLifecycle");
const { transitionConversationRoster } = require("../security/cryptoRosterState");
const {
  normalizeMime,
  assertAllowedAvatar,
  assertSafeFileBuffer
} = require("../middleware/uploadSecurity");
const {
  isValidUsername
} = require("../utils/validators");
const { hasBlockBetweenUsernames } = require("../services/blockPolicy");

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
    for (const member of members) {
      if (member !== owner && await hasBlockBetweenUsernames(owner, member)) {
        return res.status(403).json({ error: "group membership target unavailable" });
      }
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
    const group = req.avatarOwnerDocument ||
      await Group.findOne({ _id: req.params.id, lifecycleState: { $ne: "deleting" } });
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
    assertSafeAvatarDimensions(req.file.buffer, mimeType);

    const sanitizedAvatar = buildSanitizedAvatarFile(req.file, mimeType);
    const result = await uploadToR2(sanitizedAvatar, {
      folder: "liotan/groups",
      mimeType,
      storageClass: "public-avatar"
    });
    const updated = await replaceAvatar({
      model: Group,
      selector: {
        _id: group._id,
        lifecycleState: { $ne: "deleting" },
        $or: [{ owner: username }, { admins: username }]
      },
      current: group,
      ownerType: "group",
      result,
      avatarUrl: withAvatarCacheBust(result.url)
    });
    const serialized = await serializeGroup(updated);
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
    if (await hasBlockBetweenUsernames(username, member)) {
      return res.status(403).json({ error: "group membership target unavailable" });
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
async function leaveGroup(_req, res) {
  // Compatibility tombstone: the product has no whole-chat "leave and keep
  // history" mode. Current clients use the signed global deletion workflow.
  return res.status(410).json({ error: "mls-v4-required" });
}
async function deleteGroup(_req, res) {
  // Compatibility tombstone: whole-chat deletion is exclusively handled by
  // the signed MLS v4 deletion workflow. Keeping this endpoint prevents old
  // clients from silently falling back to the former partial delete path.
  return res.status(410).json({ error: "mls-v4-required" });
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
