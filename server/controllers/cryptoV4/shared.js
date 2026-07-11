"use strict";

const crypto = require("crypto");
const Group = require("../../models/Group");
const CryptoIdentity = require("../../models/CryptoIdentity");
const CryptoDevice = require("../../models/CryptoDevice");
const CryptoConversation = require("../../models/CryptoConversation");
const { decodeBase64Url } = require("../../security/cryptoV4");
const { userRoom } = require("../../sockets/sessionRegistry");

function idString(value) {
  return String(value?._id || value || "");
}

function randomId(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function safeB64(value, maxBytes, label, { optional = false } = {}) {
  if (optional && !value) return "";
  const bytes = decodeBase64Url(value, undefined, label);
  if (!bytes.length || bytes.length > maxBytes) throw new TypeError(`invalid ${label}`);
  return String(value);
}

async function getIdentityForUser(reqUser) {
  return CryptoIdentity.findOneAndUpdate(
    { userId: reqUser.userId },
    {
      $setOnInsert: {
        userId: reqUser.userId,
        cryptoUserId: crypto.randomUUID()
      },
      $set: { username: reqUser.username }
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
  );
}

function identityView(identity) {
  return {
    cryptoUserId: identity.cryptoUserId,
    rootPublicKey: identity.rootPublicKey || "",
    rootFingerprint: identity.rootFingerprint || "",
    rootCreatedAt: identity.rootCreatedAt || null,
    resetCounter: Number(identity.resetCounter) || 0
  };
}

function deviceView(device) {
  return {
    cryptoUserId: device.cryptoUserId,
    deviceId: device.deviceId,
    clientId: device.clientId,
    requestPublicKey: device.requestPublicKey,
    credentialThumbprint: device.credentialThumbprint,
    manifest: device.manifest,
    manifestSignature: device.manifestSignature,
    status: device.status,
    verifiedAt: device.verifiedAt,
    lastSeenAt: device.lastSeenAt || null,
    revokedAt: device.revokedAt || null
  };
}

async function expireConversationDevices(conversation) {
  const now = new Date();
  const query = {
    userId: { $in: conversation.participantUserIds },
    status: "active",
    $or: [
      { manifestExpiresAt: { $lte: now } },
      { manifestExpiresAt: null }
    ]
  };
  if (!await CryptoDevice.exists(query)) return false;
  await Promise.all([
    CryptoDevice.updateMany(query, { $set: { status: "expired" } }),
    CryptoConversation.updateOne(
      { _id: conversation._id },
      { $set: { blockedForEpochChange: true } }
    )
  ]);
  conversation.blockedForEpochChange = true;
  return true;
}

async function conversationDirectory(conversation) {
  await expireConversationDevices(conversation);
  const [identities, devices] = await Promise.all([
    CryptoIdentity.find({ userId: { $in: conversation.participantUserIds } }).lean(),
    CryptoDevice.find({
      userId: { $in: conversation.participantUserIds },
      status: "active",
      manifestExpiresAt: { $gt: new Date() }
    }).lean()
  ]);
  const identityByUser = new Map(identities.map(item => [idString(item.userId), item]));
  return conversation.participantUserIds.map((userId, index) => {
    const identity = identityByUser.get(idString(userId));
    return {
      userId: idString(userId),
      username: conversation.participantUsernames[index],
      identity: identity ? identityView(identity) : null,
      devices: devices.filter(device => idString(device.userId) === idString(userId)).map(deviceView)
    };
  });
}

function conversationView(conversation, directory) {
  return {
    conversationId: conversation.conversationId,
    chatType: conversation.chatType,
    groupId: conversation.groupId || null,
    protocol: conversation.protocol,
    initialized: conversation.initialized,
    blockedForEpochChange: conversation.blockedForEpochChange,
    epoch: conversation.epoch,
    sequence: conversation.sequence,
    creatorClientId: conversation.createdByClientId,
    activeClientIds: conversation.activeClientIds,
    lastCommitAt: conversation.lastCommitAt || null,
    directory
  };
}

async function assertConversationAccess(req, conversationId) {
  const conversation = await CryptoConversation.findOne({ conversationId });
  if (!conversation || !conversation.participantUserIds.some(id => idString(id) === idString(req.user.userId))) {
    const err = new Error("conversation not found"); err.status = 404; throw err;
  }
  if (conversation.chatType === "group") {
    const group = await Group.findOne({ _id: conversation.groupId, members: req.user.username }).lean();
    if (!group) { const err = new Error("conversation not found"); err.status = 404; throw err; }
  }
  await expireConversationDevices(conversation);
  return conversation;
}

async function desiredConversationClients(conversation) {
  await expireConversationDevices(conversation);
  const devices = await CryptoDevice.find({
    userId: { $in: conversation.participantUserIds },
    status: "active",
    manifestExpiresAt: { $gt: new Date() }
  }).lean();
  const usersWithDevices = new Set(devices.map(device => idString(device.userId)));
  const missingUsers = conversation.participantUserIds
    .map((userId, index) => ({ userId: idString(userId), username: conversation.participantUsernames[index] }))
    .filter(user => !usersWithDevices.has(user.userId));
  return { devices, missingUsers };
}

function emitCryptoEvent(req, conversation, sequence) {
  const io = req.app.get("io");
  if (!io) return;
  for (const userId of conversation.participantUserIds) {
    io.to(userRoom(idString(userId))).emit("cryptoEventAvailable", {
      conversationId: conversation.conversationId,
      sequence
    });
  }
}

function emitCryptoRosterChanged(req, conversations) {
  const io = req.app.get("io");
  if (!io) return;
  for (const conversation of conversations) {
    for (const userId of conversation.participantUserIds) {
      io.to(userRoom(idString(userId))).emit("cryptoRosterChanged", {
        conversationId: conversation.conversationId
      });
    }
  }
}

module.exports = {
  idString,
  randomId,
  safeB64,
  getIdentityForUser,
  identityView,
  deviceView,
  expireConversationDevices,
  conversationDirectory,
  conversationView,
  assertConversationAccess,
  desiredConversationClients,
  emitCryptoEvent,
  emitCryptoRosterChanged
};
