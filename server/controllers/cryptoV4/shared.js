"use strict";

const crypto = require("crypto");
const Group = require("../../models/Group");
const User = require("../../models/User");
const CryptoIdentity = require("../../models/CryptoIdentity");
const CryptoDevice = require("../../models/CryptoDevice");
const CryptoConversation = require("../../models/CryptoConversation");
const CryptoDirectoryEntry = require("../../models/CryptoDirectoryEntry");
const { decodeBase64Url } = require("../../security/cryptoV4");
const {
  directoryDeviceCommitment,
  directoryStateView
} = require("../../security/cryptoDirectoryState");
const {
  authorizedClientIds,
  transitionConversationRoster
} = require("../../security/cryptoRosterState");
const { userRoom } = require("../../sockets/sessionRegistry");
const { assertPrivateInteractionAllowed } = require("../../services/blockPolicy");
const { transparencyBundle } = require("../../security/keyTransparency");

const DIRECTORY_LOG_WINDOW = 1024;

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
    resetCounter: Number(identity.resetCounter) || 0,
    directory: directoryStateView(identity)
  };
}

function deviceView(device) {
  const manifestExpired = ["active", "pending"].includes(device.status) &&
    (!device.manifestExpiresAt || Date.parse(device.manifestExpiresAt) <= Date.now());
  const status = manifestExpired ? "expired" : device.status;
  return {
    cryptoUserId: device.cryptoUserId,
    deviceId: device.deviceId,
    clientId: device.clientId,
    requestPublicKey: device.requestPublicKey,
    authVersion: Number(device.authVersion) || 1,
    authProtocol: device.authProtocol || "liotan-device-auth-v1",
    sessionBindingId: device.sessionBindingId || "",
    authMigrationState: device.authMigrationState || "legacy",
    authMigratedAt: device.authMigratedAt || null,
    credentialThumbprint: device.credentialThumbprint,
    manifest: device.manifest,
    manifestSignature: device.manifestSignature,
    manifestExpiresAt: device.manifestExpiresAt || null,
    status,
    activationMode: device.activationMode || "device-approval",
    approvalChallenge: status === "pending" ? device.approvalChallenge || "" : "",
    approval: device.approval || null,
    approvalSignature: device.approvalSignature || "",
    approvedByClientId: device.approvedByClientId || "",
    approvedAt: device.approvedAt || null,
    revocation: device.revocation || null,
    revocationSignature: device.revocationSignature || "",
    verifiedAt: device.verifiedAt,
    createdAt: device.createdAt || null,
    lastSeenAt: device.lastSeenAt || null,
    revokedAt: device.revokedAt || null
  };
}

function directoryLogView(entries) {
  return [...(entries || [])]
    .sort((left, right) => Number(left.version) - Number(right.version))
    .map(entry => ({
      version: Number(entry.version),
      previousHash: entry.previousHash,
      hash: entry.hash,
      statement: entry.statement,
      signature: entry.signature
    }));
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
  const expired = await CryptoDevice.find(query, "clientId").lean();
  if (!expired.length) return false;
  await CryptoDevice.updateMany(query, { $set: { status: "expired" } });
  const transitioned = await transitionConversationRoster(
    { _id: conversation._id },
    {
      removeClientIds: expired.map(device => device.clientId),
      reason: "device manifest expired"
    }
  );
  conversation.blockedForEpochChange = true;
  conversation.authorizedClientIds = transitioned?.authorizedClientIds || authorizedClientIds(conversation);
  conversation.rosterVersion = transitioned?.rosterVersion ?? conversation.rosterVersion;
  return true;
}

async function conversationDirectory(conversation) {
  await expireConversationDevices(conversation);
  const [identities, devices] = await Promise.all([
    CryptoIdentity.find({ userId: { $in: conversation.participantUserIds } }).lean(),
    CryptoDevice.find({
      userId: { $in: conversation.participantUserIds }
    }).lean()
  ]);
  const directoryWindows = identities.map(identity => ({
    userId: identity.userId,
    version: { $gt: Math.max(0, Number(identity.directoryVersion || 0) - DIRECTORY_LOG_WINDOW) }
  }));
  const directoryEntries = directoryWindows.length
    ? await CryptoDirectoryEntry.find({ $or: directoryWindows }).sort({ userId: 1, version: 1 }).lean()
    : [];
  const identityByUser = new Map(identities.map(item => [idString(item.userId), item]));
  return Promise.all(conversation.participantUserIds.map(async (userId, index) => {
    const identity = identityByUser.get(idString(userId));
    const userDevices = devices.filter(device => idString(device.userId) === idString(userId));
    return {
      userId: idString(userId),
      username: conversation.participantUsernames[index],
      identity: identity ? {
        ...identityView(identity),
        directoryLog: directoryLogView(
          directoryEntries.filter(entry => idString(entry.userId) === idString(userId))
        ),
        transparency: await transparencyBundle(identity)
      } : null,
      deviceCommitments: userDevices.map(directoryDeviceCommitment),
      devices: userDevices
        .filter(device => device.status === "active" && Date.parse(device.manifestExpiresAt || "") > Date.now())
        .map(deviceView)
    };
  }));
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
    legacyMutationCutoffSequence: Number(conversation.legacyMutationCutoffSequence) || 0,
    creatorClientId: conversation.createdByClientId,
    activeClientIds: conversation.activeClientIds,
    authorizedClientIds: authorizedClientIds(conversation),
    rosterVersion: Number(conversation.rosterVersion) || 0,
    operationGeneration: Number(conversation.operationGeneration) || 0,
    lastCommitAt: conversation.lastCommitAt || null,
    directory
  };
}

async function assertConversationAccess(req, conversationId, { session = null } = {}) {
  let findConversation = CryptoConversation.findOne({ conversationId, lifecycleState: { $ne: "deleting" } });
  if (session) findConversation = findConversation.session(session);
  const conversation = await findConversation;
  if (!conversation || !conversation.participantUserIds.some(id => idString(id) === idString(req.user.userId))) {
    const err = new Error("conversation not found"); err.status = 404; throw err;
  }
  if (conversation.chatType === "group") {
    let findGroup = Group.findOne({
      _id: conversation.groupId,
      members: req.user.username,
      lifecycleState: { $ne: "deleting" }
    });
    if (session) findGroup = findGroup.session(session);
    const group = await findGroup.lean();
    if (!group) { const err = new Error("conversation not found"); err.status = 404; throw err; }
  }
  if (conversation.chatType === "private") {
    const otherUserId = conversation.participantUserIds.find(id => idString(id) !== idString(req.user.userId));
    if (otherUserId) await assertPrivateInteractionAllowed(req.user.userId, otherUserId, { session });
  }
  await expireConversationDevices(conversation);
  return conversation;
}

async function desiredConversationClients(conversation, { session = null } = {}) {
  await expireConversationDevices(conversation);
  let participantUserIds = conversation.participantUserIds;
  let participantUsernames = conversation.participantUsernames;
  if (conversation.chatType === "group") {
    let findGroup = Group.findById(conversation.groupId);
    if (session) findGroup = findGroup.session(session);
    const group = await findGroup.lean();
    if (!group) return { devices: [], missingUsers: [] };
    let findUsers = User.find({ username: { $in: group.members } }, "username");
    if (session) findUsers = findUsers.session(session);
    const users = await findUsers.lean();
    const byUsername = new Map(users.map(user => [user.username, user]));
    const ordered = group.members.map(username => byUsername.get(username)).filter(Boolean);
    participantUserIds = ordered.map(user => user._id);
    participantUsernames = ordered.map(user => user.username);
  }
  let findDevices = CryptoDevice.find({
    userId: { $in: participantUserIds },
    status: "active",
    manifestExpiresAt: { $gt: new Date() }
  });
  if (session) findDevices = findDevices.session(session);
  const devices = await findDevices.lean();
  const usersWithDevices = new Set(devices.map(device => idString(device.userId)));
  const missingUsers = participantUserIds
    .map((userId, index) => ({ userId: idString(userId), username: participantUsernames[index] }))
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
  directoryLogView,
  DIRECTORY_LOG_WINDOW,
  expireConversationDevices,
  conversationDirectory,
  conversationView,
  assertConversationAccess,
  desiredConversationClients,
  emitCryptoEvent,
  emitCryptoRosterChanged
};
