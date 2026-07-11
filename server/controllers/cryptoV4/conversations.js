"use strict";

const mongoose = require("mongoose");
const User = require("../../models/User");
const Group = require("../../models/Group");
const CryptoKeyPackage = require("../../models/CryptoKeyPackage");
const CryptoConversation = require("../../models/CryptoConversation");
const CryptoOperation = require("../../models/CryptoOperation");
const CryptoEvent = require("../../models/CryptoEvent");
const { decodeBase64Url, isUuid } = require("../../security/cryptoV4");
const {
  idString, randomId, safeB64, conversationDirectory, conversationView,
  assertConversationAccess, desiredConversationClients, emitCryptoEvent
} = require("./shared");

const MAX_COMMIT_BYTES = 2 * 1024 * 1024;
const MAX_WELCOME_BYTES = 8 * 1024 * 1024;
const MAX_CIPHERTEXT_BYTES = 2 * 1024 * 1024;
const OPERATION_TTL_MS = 5 * 60 * 1000;
const MIN_SELF_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function resolveParticipants(req) {
  const chatType = String(req.body.chatType || "");
  if (chatType === "private") {
    const targetUsername = String(req.body.targetUsername || "").trim();
    const users = await User.find({
      username: { $in: [...new Set([req.user.username, targetUsername])] },
      emailVerified: true
    }, "username").lean();
    const expectedCount = targetUsername === req.user.username ? 1 : 2;
    if (users.length !== expectedCount || !users.some(user => user.username === targetUsername)) {
      const err = new Error("private conversation participant not found");
      err.status = 404;
      throw err;
    }
    users.sort((a, b) => idString(a).localeCompare(idString(b)));
    return {
      chatType,
      lookupKey: `private:${idString(users[0])}:${idString(users[1])}`,
      groupId: null,
      users,
      admins: users.map(user => user._id)
    };
  }

  if (chatType === "group") {
    if (!mongoose.isValidObjectId(req.body.groupId)) {
      const err = new Error("invalid group id"); err.status = 400; throw err;
    }
    const group = await Group.findById(req.body.groupId).lean();
    if (!group || !group.members.includes(req.user.username)) {
      const err = new Error("group not found"); err.status = 404; throw err;
    }
    const users = await User.find({ username: { $in: group.members }, emailVerified: true }, "username").lean();
    const byUsername = new Map(users.map(user => [user.username, user]));
    const ordered = group.members.map(username => byUsername.get(username)).filter(Boolean);
    const adminIds = [...new Set([group.owner, ...(group.admins || [])])]
      .map(username => byUsername.get(username)?._id).filter(Boolean);
    return {
      chatType,
      lookupKey: `group:${idString(group._id)}`,
      groupId: group._id,
      users: ordered,
      admins: adminIds
    };
  }
  const err = new Error("invalid chat type"); err.status = 400; throw err;
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

async function resolveConversation(req, res, next) {
  try {
    const resolved = await resolveParticipants(req);
    const userIds = resolved.users.map(user => user._id);
    let conversation = await CryptoConversation.findOne({ lookupKey: resolved.lookupKey });
    if (!conversation) {
      try {
        conversation = await CryptoConversation.create({
          conversationId: randomId(32),
          lookupKey: resolved.lookupKey,
          chatType: resolved.chatType,
          groupId: resolved.groupId,
          participantUserIds: userIds,
          participantUsernames: resolved.users.map(user => user.username),
          adminUserIds: resolved.admins,
          createdByUserId: req.user.userId,
          createdByClientId: req.cryptoDevice.clientId
        });
      } catch (err) {
        if (err?.code !== 11000) throw err;
        conversation = await CryptoConversation.findOne({ lookupKey: resolved.lookupKey });
      }
    }

    if (resolved.chatType === "group") {
      const previousUsers = new Set(conversation.participantUserIds.map(idString));
      const nextUsers = new Set(userIds.map(idString));
      const changed = previousUsers.size !== nextUsers.size || [...previousUsers].some(id => !nextUsers.has(id));
      conversation.participantUserIds = userIds;
      conversation.participantUsernames = resolved.users.map(user => user.username);
      conversation.adminUserIds = resolved.admins;
      if (changed) conversation.blockedForEpochChange = true;
      await conversation.save();
    }
    const directory = await conversationDirectory(conversation);
    return res.json(conversationView(conversation, directory));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

async function claimPackageForClient(clientId, operationId, conversationId, session) {
  return CryptoKeyPackage.findOneAndUpdate(
    { clientId, claimedAt: null, expiresAt: { $gt: new Date(Date.now() + 5 * 60 * 1000) } },
    { $set: { claimedAt: new Date(), claimedBy: operationId, conversationId } },
    { returnDocument: "after", sort: { expiresAt: 1 }, session }
  );
}

async function beginOperation(req, res, next) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const conversation = await assertConversationAccess(req, req.params.conversationId);
      await CryptoKeyPackage.updateMany(
        {
          conversationId: conversation.conversationId,
          claimedAt: { $lt: new Date(Date.now() - OPERATION_TTL_MS) }
        },
        {
          $set: { claimedAt: null, claimedBy: "", conversationId: "" }
        },
        { session }
      );
      if (conversation.blockedForEpochChange && await CryptoOperation.exists({
        conversationId: conversation.conversationId,
        status: "pending",
        expiresAt: { $gt: new Date() }
      }).session(session)) {
        const err = new Error("epoch change already pending"); err.status = 409; throw err;
      }
      const desired = await desiredConversationClients(conversation);
      if (!conversation.initialized && desired.missingUsers.length) {
        const err = new Error("every participant must register an MLS device");
        err.status = 409;
        err.details = { missingUsers: desired.missingUsers.map(user => user.username) };
        throw err;
      }
      const desiredIds = desired.devices.map(device => device.clientId).sort();
      if (!desiredIds.includes(req.cryptoDevice.clientId)) {
        const err = new Error("requesting device is not a conversation member"); err.status = 403; throw err;
      }
      const currentIds = [...conversation.activeClientIds];
      if (conversation.initialized && !currentIds.includes(req.cryptoDevice.clientId)) {
        const err = new Error("an existing MLS member must add this device");
        err.status = 409;
        throw err;
      }
      let type = "update";
      const forceUpdate = req.body.forceUpdate === true;
      let addClientIds = desiredIds.filter(id => !currentIds.includes(id));
      let removeClientIds = currentIds.filter(id => !desiredIds.includes(id));
      const hasDeferredAdds = addClientIds.length > 0 && removeClientIds.length > 0;
      if (!conversation.initialized) {
        type = "init";
        addClientIds = desiredIds.filter(id => id !== req.cryptoDevice.clientId);
        removeClientIds = [];
        if (conversation.createdByClientId !== req.cryptoDevice.clientId &&
          Date.now() - conversation.createdAt.getTime() < OPERATION_TTL_MS) {
          const err = new Error("conversation creator must initialize MLS"); err.status = 409; throw err;
        }
      } else if (addClientIds.length && removeClientIds.length) {
        // Security first: remove revoked/departed devices in their own epoch.
        // A later reconcile adds new devices. CoreCrypto emits one commit per
        // operation, so combining both here would make server/client epochs diverge.
        type = "remove";
        addClientIds = [];
      }
      else if (addClientIds.length) type = "add";
      else if (removeClientIds.length) type = "remove";
      else if (
        forceUpdate &&
        conversation.initialized &&
        (!conversation.lastCommitAt || Date.now() - conversation.lastCommitAt.getTime() >= MIN_SELF_UPDATE_INTERVAL_MS)
      ) {
        type = "update";
      } else {
        conversation.blockedForEpochChange = desired.missingUsers.length > 0;
        await conversation.save({ session });
        result = { noChange: true, conversation: conversationView(conversation, await conversationDirectory(conversation)) };
        return;
      }

      const operationId = randomId(24);
      const packages = [];
      for (const clientId of addClientIds) {
        const keyPackage = await claimPackageForClient(clientId, operationId, conversation.conversationId, session);
        if (!keyPackage) {
          const err = new Error("participant has no unused MLS key package");
          err.status = 409;
          err.details = { clientId };
          throw err;
        }
        packages.push({ clientId, packageHash: keyPackage.packageHash, payload: keyPackage.payload });
      }
      conversation.blockedForEpochChange = true;
      await conversation.save({ session });
      const [operation] = await CryptoOperation.create([{
        operationId,
        conversationId: conversation.conversationId,
        type,
        requestedByUserId: req.user.userId,
        requestedByClientId: req.cryptoDevice.clientId,
        addClientIds,
        removeClientIds,
        packageHashes: packages.map(item => item.packageHash),
        blockAfterCommit: desired.missingUsers.length > 0 || hasDeferredAdds,
        expiresAt: new Date(Date.now() + OPERATION_TTL_MS)
      }], { session });
      result = {
        noChange: false,
        operation: {
          operationId: operation.operationId,
          type,
          conversationId: conversation.conversationId,
          expectedEpoch: Number(conversation.epoch) + 1,
          addClientIds,
          removeClientIds,
          keyPackages: packages,
          expiresAt: operation.expiresAt
        }
      };
    });
    return res.status(result.noChange ? 200 : 201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, ...(err.details || {}) });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function commitOperation(req, res, next) {
  const session = await mongoose.startSession();
  try {
    let emitted;
    await session.withTransaction(async () => {
      const conversation = await assertConversationAccess(req, req.params.conversationId);
      const operation = await CryptoOperation.findOne({
        operationId: req.params.operationId,
        conversationId: conversation.conversationId,
        requestedByClientId: req.cryptoDevice.clientId,
        status: "pending",
        expiresAt: { $gt: new Date() }
      }).session(session);
      if (!operation) { const err = new Error("pending MLS operation not found"); err.status = 409; throw err; }

      const epoch = Number(req.body.epoch);
      if (!Number.isSafeInteger(epoch) || epoch !== Number(conversation.epoch) + 1) {
        const err = new Error("unexpected MLS epoch"); err.status = 409; throw err;
      }
      const commit = safeB64(req.body.commit, MAX_COMMIT_BYTES, "MLS commit");
      const welcome = safeB64(req.body.welcome, MAX_WELCOME_BYTES, "MLS welcome", { optional: true });
      if (operation.addClientIds.length && !welcome) {
        const err = new Error("MLS welcome required when adding clients"); err.status = 400; throw err;
      }
      const groupInfo = req.body.groupInfo && typeof req.body.groupInfo === "object"
        ? {
            encryptionType: Number(req.body.groupInfo.encryptionType),
            ratchetTreeType: Number(req.body.groupInfo.ratchetTreeType),
            payload: safeB64(req.body.groupInfo.payload, MAX_COMMIT_BYTES, "MLS group info")
          }
        : null;

      const priorIds = [...conversation.activeClientIds];
      const nextIds = [...new Set([
        ...(operation.type === "init" ? [req.cryptoDevice.clientId] : priorIds),
        ...operation.addClientIds
      ])].filter(id => !operation.removeClientIds.includes(id)).sort();
      const recipients = [...new Set([...priorIds, ...nextIds])];
      conversation.sequence += 1;
      conversation.epoch = epoch;
      conversation.activeClientIds = nextIds;
      conversation.initialized = true;
      conversation.blockedForEpochChange = operation.blockAfterCommit === true;
      conversation.lastCommitAt = new Date();
      operation.status = "committed";
      operation.committedAt = new Date();
      const byteLength = decodeBase64Url(commit, undefined, "MLS commit").length +
        (welcome ? decodeBase64Url(welcome, undefined, "MLS welcome").length : 0);
      await CryptoEvent.create([{
        conversationId: conversation.conversationId,
        sequence: conversation.sequence,
        kind: "commit",
        senderUserId: req.user.userId,
        senderUsername: req.user.username,
        senderClientId: req.cryptoDevice.clientId,
        commit,
        welcome,
        groupInfo,
        recipients,
        epoch,
        byteLength
      }], { session });
      await Promise.all([conversation.save({ session }), operation.save({ session })]);
      emitted = { conversation, sequence: conversation.sequence, epoch, activeClientIds: nextIds };
    });
    emitCryptoEvent(req, emitted.conversation, emitted.sequence);
    return res.status(201).json({ ok: true, sequence: emitted.sequence, epoch: emitted.epoch, activeClientIds: emitted.activeClientIds });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function sendCiphertext(req, res, next) {
  const session = await mongoose.startSession();
  try {
    let emitted;
    await session.withTransaction(async () => {
      const conversation = await assertConversationAccess(req, req.params.conversationId);
      if (!conversation.initialized || conversation.blockedForEpochChange || !conversation.activeClientIds.includes(req.cryptoDevice.clientId)) {
        const err = new Error("MLS conversation is not ready for messages"); err.status = 409; throw err;
      }
      const epoch = Number(req.body.epoch);
      const clientMessageId = String(req.body.clientMessageId || "").toLowerCase();
      if (!isUuid(clientMessageId) || epoch !== Number(conversation.epoch)) {
        const err = new Error("invalid MLS message metadata"); err.status = 400; throw err;
      }
      const ciphertext = safeB64(req.body.ciphertext, MAX_CIPHERTEXT_BYTES, "MLS ciphertext");
      const existing = await CryptoEvent.findOne({
        conversationId: conversation.conversationId,
        clientMessageId
      }).session(session);
      if (existing) {
        if (existing.senderClientId !== req.cryptoDevice.clientId) {
          const err = new Error("MLS client message id already used"); err.status = 409; throw err;
        }
        emitted = { duplicate: true, conversation, sequence: existing.sequence, epoch: existing.epoch };
        return;
      }
      conversation.sequence += 1;
      await CryptoEvent.create([{
        conversationId: conversation.conversationId,
        sequence: conversation.sequence,
        kind: "message",
        senderUserId: req.user.userId,
        senderUsername: req.user.username,
        senderClientId: req.cryptoDevice.clientId,
        clientMessageId,
        ciphertext,
        recipients: conversation.activeClientIds,
        epoch,
        byteLength: decodeBase64Url(ciphertext, undefined, "MLS ciphertext").length
      }], { session });
      await conversation.save({ session });
      emitted = { duplicate: false, conversation, sequence: conversation.sequence, epoch };
    });
    if (!emitted.duplicate) emitCryptoEvent(req, emitted.conversation, emitted.sequence);
    return res.status(emitted.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: emitted.duplicate,
      sequence: emitted.sequence,
      epoch: emitted.epoch
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function getEvents(req, res, next) {
  try {
    const conversation = await assertConversationAccess(req, req.params.conversationId);
    if (!conversation.activeClientIds.includes(req.cryptoDevice.clientId)) {
      return res.status(403).json({ error: "crypto device is not an active MLS member" });
    }
    const after = Math.max(0, Number.parseInt(req.query.after, 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const events = await CryptoEvent.find({
      conversationId: conversation.conversationId,
      sequence: { $gt: after },
      recipients: req.cryptoDevice.clientId
    }).sort({ sequence: 1 }).limit(limit).lean();
    return res.json({
      conversation: conversationView(conversation, null),
      events: events.map(event => ({
        sequence: event.sequence,
        kind: event.kind,
        senderUsername: event.senderUsername,
        senderClientId: event.senderClientId,
        clientMessageId: event.clientMessageId || "",
        ciphertext: event.ciphertext || "",
        commit: event.commit || "",
        welcome: event.welcome || "",
        groupInfo: event.groupInfo || null,
        epoch: event.epoch,
        createdAt: event.createdAt
      })),
      hasMore: events.length === limit
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

module.exports = {
  resolveConversation,
  beginOperation,
  commitOperation,
  sendCiphertext,
  getEvents
};
