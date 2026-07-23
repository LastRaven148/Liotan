"use strict";

const mongoose = require("mongoose");
const User = require("../../models/User");
const Group = require("../../models/Group");
const CryptoKeyPackage = require("../../models/CryptoKeyPackage");
const CryptoConversation = require("../../models/CryptoConversation");
const CryptoOperation = require("../../models/CryptoOperation");
const CryptoEvent = require("../../models/CryptoEvent");
const AttachmentUpload = require("../../models/AttachmentUpload");
const { promoteMediaUploadQuota } = require("../../services/mediaQuota");
const { decodeBase64Url, sha256Base64Url, isUuid } = require("../../security/cryptoV4");
const { assertPrivateInteractionAllowed } = require("../../services/blockPolicy");
const {
  normalizeClientIds,
  clientIdsHash,
  authorizedClientIds,
  operationIntentHash,
  cancelPendingOperations,
  transitionConversationRoster
} = require("../../security/cryptoRosterState");
const {
  idString, randomId, safeB64, conversationDirectory, conversationView,
  assertConversationAccess, desiredConversationClients, emitCryptoEvent
} = require("./shared");

const MAX_COMMIT_BYTES = 2 * 1024 * 1024;
const MAX_WELCOME_BYTES = 8 * 1024 * 1024;
const MAX_CIPHERTEXT_BYTES = 2 * 1024 * 1024;
const OPERATION_TTL_MS = 5 * 60 * 1000;
const MIN_SELF_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function messageIdempotencyMatches(event, {
  senderClientId,
  epoch,
  ciphertextHash,
  attachmentUploadId = "",
  attachmentDeleteUploadId = ""
}) {
  const storedHash = event.ciphertextHash ||
    (event.ciphertext ? sha256Base64Url(decodeBase64Url(event.ciphertext, undefined, "MLS ciphertext")) : "");
  return event.kind === "message" &&
    event.senderClientId === senderClientId &&
    Number(event.epoch) === Number(epoch) &&
    storedHash === ciphertextHash &&
    String(event.attachmentUploadId || "") === String(attachmentUploadId || "") &&
    String(event.attachmentDeleteUploadId || "") === String(attachmentDeleteUploadId || "");
}

async function resolveParticipants(req) {
  const chatType = String(req.body.chatType || "");
  if (chatType === "private") {
    const targetUsername = String(req.body.targetUsername || "").trim();
    const users = await User.find({
      username: { $in: [...new Set([req.user.username, targetUsername])] },
      emailVerified: true,
      lifecycleState: { $ne: "deleting" }
    }, "username").lean();
    const expectedCount = targetUsername === req.user.username ? 1 : 2;
    if (users.length !== expectedCount || !users.some(user => user.username === targetUsername)) {
      const err = new Error("private conversation participant not found");
      err.status = 404;
      throw err;
    }
    users.sort((a, b) => idString(a).localeCompare(idString(b)));
    if (targetUsername !== req.user.username) {
      const target = users.find(user => user.username === targetUsername);
      await assertPrivateInteractionAllowed(req.user.userId, target._id);
    }
    return {
      chatType,
      lookupKey: `private:${idString(users[0])}:${idString(users[1])}`,
      groupId: null,
      users,
      admins: users.map(user => user._id)
    };
  }

  if (chatType === "group") {
    const rawGroupId = req.body.groupId;
    if (typeof rawGroupId !== "string" || !/^[a-f\d]{24}$/i.test(rawGroupId)) {
      const err = new Error("invalid group id"); err.status = 400; throw err;
    }
    const groupId = new mongoose.Types.ObjectId(rawGroupId);
    const group = await Group.findOne({
      _id: groupId,
      lifecycleState: { $ne: "deleting" }
    }).lean();
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

async function resolveConversation(req, res, next) {
  try {
    const resolved = await resolveParticipants(req);
    const userIds = resolved.users.map(user => user._id);
    let conversation = await CryptoConversation.findOne({ lookupKey: resolved.lookupKey });
    if (conversation?.lifecycleState === "deleting") {
      const err = new Error("conversation deletion is in progress"); err.status = 409; throw err;
    }
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
    const desired = await desiredConversationClients(conversation);
    const desiredIds = normalizeClientIds(desired.devices.map(device => device.clientId));
    const currentAuthorizedIds = authorizedClientIds(conversation);
    if (clientIdsHash(desiredIds) !== clientIdsHash(currentAuthorizedIds)) {
      conversation = await transitionConversationRoster(
        { _id: conversation._id },
        {
          addClientIds: desiredIds.filter(id => !currentAuthorizedIds.includes(id)),
          removeClientIds: currentAuthorizedIds.filter(id => !desiredIds.includes(id)),
          reason: "resolved device directory changed"
        }
      );
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
      const conversation = await assertConversationAccess(req, req.params.conversationId, { session });
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
      const expiredOperations = await CryptoOperation.find({
        conversationId: conversation.conversationId,
        status: "pending",
        expiresAt: { $lte: new Date() }
      }, "operationId").session(session).lean();
      if (expiredOperations.length) {
        const expiredIds = expiredOperations.map(item => item.operationId);
        await CryptoOperation.updateMany(
          { operationId: { $in: expiredIds }, status: "pending" },
          { $set: { status: "expired", cancellationReason: "operation expired" } },
          { session }
        );
        await CryptoKeyPackage.updateMany(
          { claimedBy: { $in: expiredIds } },
          { $set: { claimedAt: null, claimedBy: "", conversationId: "" } },
          { session }
        );
      }
      const desired = await desiredConversationClients(conversation, { session });
      const desiredIds = normalizeClientIds(desired.devices.map(device => device.clientId));
      const priorAuthorizedIds = authorizedClientIds(conversation);
      if (clientIdsHash(priorAuthorizedIds) !== clientIdsHash(desiredIds)) {
        conversation.authorizedClientIds = desiredIds;
        conversation.rosterVersion = (Number(conversation.rosterVersion) || 0) + 1;
        conversation.blockedForEpochChange = true;
        await conversation.save({ session });
        await cancelPendingOperations(
          [conversation.conversationId],
          "device directory changed before operation creation",
          { session }
        );
      }
      if (await CryptoOperation.exists({
        conversationId: conversation.conversationId,
        status: "pending",
        expiresAt: { $gt: new Date() }
      }).session(session)) {
        const err = new Error("epoch change already pending"); err.status = 409; throw err;
      }
      if (!conversation.initialized && desired.missingUsers.length) {
        const err = new Error("every participant must register an MLS device");
        err.status = 409;
        err.details = { missingUsers: desired.missingUsers.map(user => user.username) };
        throw err;
      }
      if (!desiredIds.includes(req.cryptoDevice.clientId)) {
        const err = new Error("requesting device is not a conversation member"); err.status = 403; throw err;
      }
      const currentIds = normalizeClientIds(conversation.activeClientIds);
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
        conversation.blockedForEpochChange = desired.missingUsers.length > 0 ||
          clientIdsHash(currentIds) !== clientIdsHash(desiredIds);
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
      const expectedActiveClientIds = normalizeClientIds([
        ...(type === "init" ? [req.cryptoDevice.clientId] : currentIds),
        ...addClientIds
      ].filter(id => !removeClientIds.includes(id)));
      const baseRosterVersion = Number(conversation.rosterVersion) || 0;
      const baseEpoch = Number(conversation.epoch) || 0;
      const operationGeneration = (Number(conversation.operationGeneration) || 0) + 1;
      const baseActiveClientIdsHash = clientIdsHash(currentIds);
      const authorizedClientIdsHash = clientIdsHash(desiredIds);
      const expectedActiveClientIdsHash = clientIdsHash(expectedActiveClientIds);
      const intent = {
        v: 1,
        conversationId: conversation.conversationId,
        operationId,
        type,
        requestedByClientId: req.cryptoDevice.clientId,
        baseRosterVersion,
        baseEpoch,
        operationGeneration,
        baseActiveClientIdsHash,
        authorizedClientIdsHash,
        addClientIds,
        removeClientIds,
        expectedActiveClientIdsHash
      };
      const intentHash = operationIntentHash(intent);
      const blockAfterCommit = desired.missingUsers.length > 0 || hasDeferredAdds ||
        expectedActiveClientIdsHash !== authorizedClientIdsHash;
      conversation.blockedForEpochChange = true;
      conversation.operationGeneration = operationGeneration;
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
        baseRosterVersion,
        baseEpoch,
        operationGeneration,
        baseActiveClientIdsHash,
        authorizedClientIdsHash,
        expectedActiveClientIds,
        expectedActiveClientIdsHash,
        intentHash,
        blockAfterCommit,
        expiresAt: new Date(Date.now() + OPERATION_TTL_MS)
      }], { session });
      result = {
        noChange: false,
        operation: {
          operationId: operation.operationId,
          type,
          conversationId: conversation.conversationId,
          expectedEpoch: Number(conversation.epoch) + 1,
          baseRosterVersion,
          baseEpoch,
          operationGeneration,
          baseActiveClientIdsHash,
          authorizedClientIdsHash,
          expectedActiveClientIds,
          expectedActiveClientIdsHash,
          intentHash,
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
      const conversation = await assertConversationAccess(req, req.params.conversationId, { session });
      const operation = await CryptoOperation.findOne({
        operationId: req.params.operationId,
        conversationId: conversation.conversationId,
        requestedByClientId: req.cryptoDevice.clientId
      }).session(session);
      if (!operation || operation.status !== "pending" || operation.expiresAt <= new Date()) {
        const err = new Error("pending MLS operation not found or no longer current"); err.status = 409; throw err;
      }

      const priorIds = normalizeClientIds(conversation.activeClientIds);
      const currentAuthorizedIds = authorizedClientIds(conversation);
      const stale =
        Number(operation.baseRosterVersion) !== (Number(conversation.rosterVersion) || 0) ||
        Number(operation.baseEpoch) !== (Number(conversation.epoch) || 0) ||
        Number(operation.operationGeneration) !== (Number(conversation.operationGeneration) || 0) ||
        operation.baseActiveClientIdsHash !== clientIdsHash(priorIds) ||
        operation.authorizedClientIdsHash !== clientIdsHash(currentAuthorizedIds);
      if (stale) {
        const err = new Error("stale MLS operation conflicts with the current roster generation"); err.status = 409; throw err;
      }

      const commitResult = req.body.result;
      const reportedIds = normalizeClientIds(commitResult?.activeClientIds);
      const resultMatchesIntent = commitResult &&
        commitResult.v === 1 &&
        commitResult.operationId === operation.operationId &&
        Number(commitResult.baseRosterVersion) === Number(operation.baseRosterVersion) &&
        Number(commitResult.baseEpoch) === Number(operation.baseEpoch) &&
        Number(commitResult.operationGeneration) === Number(operation.operationGeneration) &&
        commitResult.intentHash === operation.intentHash &&
        commitResult.activeClientIdsHash === operation.expectedActiveClientIdsHash &&
        clientIdsHash(reportedIds) === operation.expectedActiveClientIdsHash;
      if (!resultMatchesIntent) {
        const err = new Error("MLS commit result does not match the authorized operation intent"); err.status = 409; throw err;
      }

      const epoch = Number(req.body.epoch);
      if (!Number.isSafeInteger(epoch) || epoch !== Number(operation.baseEpoch) + 1) {
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

      const nextIds = normalizeClientIds(operation.expectedActiveClientIds);
      const recipients = [...new Set([...priorIds, ...nextIds])];
      conversation.sequence += 1;
      conversation.epoch = epoch;
      conversation.activeClientIds = nextIds;
      conversation.initialized = true;
      conversation.blockedForEpochChange = operation.blockAfterCommit === true ||
        clientIdsHash(nextIds) !== clientIdsHash(currentAuthorizedIds);
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
      emitted = {
        conversation,
        sequence: conversation.sequence,
        epoch,
        activeClientIds: nextIds,
        authorizedClientIds: currentAuthorizedIds,
        rosterVersion: Number(conversation.rosterVersion) || 0
      };
    });
    emitCryptoEvent(req, emitted.conversation, emitted.sequence);
    return res.status(201).json({
      ok: true,
      sequence: emitted.sequence,
      epoch: emitted.epoch,
      activeClientIds: emitted.activeClientIds,
      authorizedClientIds: emitted.authorizedClientIds,
      rosterVersion: emitted.rosterVersion
    });
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
  let idempotencyInput = null;
  try {
    let emitted;
    await session.withTransaction(async () => {
      const conversation = await assertConversationAccess(req, req.params.conversationId, { session });
      const activeIds = normalizeClientIds(conversation.activeClientIds);
      const authorizedIds = authorizedClientIds(conversation);
      if (!conversation.initialized || conversation.blockedForEpochChange ||
        clientIdsHash(activeIds) !== clientIdsHash(authorizedIds) ||
        !activeIds.includes(req.cryptoDevice.clientId) ||
        !authorizedIds.includes(req.cryptoDevice.clientId)) {
        const err = new Error("MLS conversation is not ready for messages"); err.status = 409; throw err;
      }
      const epoch = Number(req.body.epoch);
      const clientMessageId = String(req.body.clientMessageId || "").toLowerCase();
      if (!isUuid(clientMessageId) || !Number.isSafeInteger(epoch) || epoch < 0) {
        const err = new Error("invalid MLS message metadata"); err.status = 400; throw err;
      }
      const ciphertext = safeB64(req.body.ciphertext, MAX_CIPHERTEXT_BYTES, "MLS ciphertext");
      const ciphertextBytes = decodeBase64Url(ciphertext, undefined, "MLS ciphertext");
      const ciphertextHash = sha256Base64Url(ciphertextBytes);
      const attachmentCommit = req.body.attachmentCommit == null ? null : req.body.attachmentCommit;
      if (attachmentCommit !== null && (
        !attachmentCommit || Array.isArray(attachmentCommit) || typeof attachmentCommit !== "object" ||
        !/^[A-Za-z0-9_-]{16,80}$/.test(String(attachmentCommit.uploadId || "")) ||
        !/^[A-Za-z0-9_-]{43}$/.test(String(attachmentCommit.token || "")) ||
        Object.keys(attachmentCommit).some(key => !["uploadId", "token"].includes(key))
      )) {
        const err = new Error("invalid MLS attachment commit capability"); err.status = 400; throw err;
      }
      const attachmentUploadId = String(attachmentCommit?.uploadId || "");
      const attachmentDelete = req.body.attachmentDelete == null ? null : req.body.attachmentDelete;
      if (attachmentDelete !== null && (
        !attachmentDelete || Array.isArray(attachmentDelete) || typeof attachmentDelete !== "object" ||
        !/^[A-Za-z0-9_-]{16,80}$/.test(String(attachmentDelete.uploadId || "")) ||
        !/^[A-Za-z0-9_-]{43}$/.test(String(attachmentDelete.token || "")) ||
        Object.keys(attachmentDelete).some(key => !["uploadId", "token"].includes(key))
      )) {
        const err = new Error("invalid MLS attachment deletion capability"); err.status = 400; throw err;
      }
      if (attachmentCommit && attachmentDelete) {
        const err = new Error("MLS event cannot commit and delete an attachment together"); err.status = 400; throw err;
      }
      const attachmentDeleteUploadId = String(attachmentDelete?.uploadId || "");
      idempotencyInput = {
        conversationId: conversation.conversationId,
        clientMessageId,
        senderClientId: req.cryptoDevice.clientId,
        epoch,
        ciphertextHash,
        attachmentUploadId,
        attachmentDeleteUploadId
      };
      const existing = await CryptoEvent.findOne({
        conversationId: conversation.conversationId,
        clientMessageId
      }).session(session);
      if (existing) {
        if (!messageIdempotencyMatches(existing, idempotencyInput)) {
          const err = new Error("MLS client message id idempotency mismatch"); err.status = 409; throw err;
        }
        emitted = { duplicate: true, conversation, sequence: existing.sequence, epoch: existing.epoch };
        return;
      }
      if (epoch !== Number(conversation.epoch)) {
        const err = new Error("invalid MLS message metadata"); err.status = 400; throw err;
      }
      conversation.sequence += 1;
      if (attachmentCommit) {
        const committedUpload = await AttachmentUpload.findOneAndUpdate(
          {
            uploadId: attachmentUploadId,
            owner: req.user.username,
            protocol: "mls-media-1",
            encrypted: true,
            cryptoConversationId: conversation.conversationId,
            cryptoClientId: req.cryptoDevice.clientId,
            boundClientMessageId: clientMessageId,
            commitTokenHash: sha256Base64Url(Buffer.from(attachmentCommit.token, "utf8")),
            lifecycleState: "temporary",
            expiresAt: { $gt: new Date() }
          },
          {
            $set: {
              lifecycleState: "committed",
              committedAt: new Date(),
              committedEventSequence: conversation.sequence,
              usedAt: new Date(),
              expiresAt: null,
              commitTokenHash: ""
            }
          },
          { returnDocument: "after", session }
        );
        if (!committedUpload) {
          const err = new Error("MLS attachment commit capability is invalid, expired, or already used"); err.status = 409; throw err;
        }
        await promoteMediaUploadQuota(committedUpload.uploadId, { session });
      }
      if (attachmentDelete) {
        const scheduled = await AttachmentUpload.findOneAndUpdate(
          {
            uploadId: attachmentDeleteUploadId,
            owner: req.user.username,
            protocol: "mls-media-1",
            encrypted: true,
            cryptoConversationId: conversation.conversationId,
            deleteTokenHash: sha256Base64Url(Buffer.from(attachmentDelete.token, "utf8")),
            lifecycleState: "committed"
          },
          {
            $set: {
              lifecycleState: "deletion-pending",
              expiresAt: new Date(),
              cleanupAttempts: 0,
              cleanupLastErrorAt: null
            }
          },
          { returnDocument: "after", session }
        );
        if (!scheduled) {
          const err = new Error("MLS attachment deletion capability is invalid or already used"); err.status = 409; throw err;
        }
      }
      await CryptoEvent.create([{
        conversationId: conversation.conversationId,
        sequence: conversation.sequence,
        kind: "message",
        senderUserId: req.user.userId,
        senderUsername: req.user.username,
        senderClientId: req.cryptoDevice.clientId,
        clientMessageId,
        ciphertext,
        ciphertextHash,
        attachmentUploadId,
        attachmentDeleteUploadId,
        recipients: activeIds,
        epoch,
        byteLength: ciphertextBytes.length
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
    if (err?.code === 11000 && idempotencyInput) {
      const existing = await CryptoEvent.findOne({
        conversationId: idempotencyInput.conversationId,
        clientMessageId: idempotencyInput.clientMessageId
      }).lean();
      if (existing && messageIdempotencyMatches(existing, idempotencyInput)) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          sequence: existing.sequence,
          epoch: existing.epoch
        });
      }
      return res.status(409).json({ error: "MLS client message id idempotency mismatch" });
    }
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
    const activeIds = normalizeClientIds(conversation.activeClientIds);
    const authorizedIds = authorizedClientIds(conversation);
    if (!activeIds.includes(req.cryptoDevice.clientId) || !authorizedIds.includes(req.cryptoDevice.clientId)) {
      return res.status(403).json({ error: "crypto device is not an active MLS member" });
    }
    const after = Math.max(0, Number.parseInt(req.query.after, 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const recipientFilter = {
      conversationId: conversation.conversationId,
      recipients: req.cryptoDevice.clientId
    };
    const [events, latestRecipientEvent] = await Promise.all([
      CryptoEvent.find({
        ...recipientFilter,
        sequence: { $gt: after }
      }).sort({ sequence: 1 }).limit(limit).lean(),
      CryptoEvent.findOne(recipientFilter).sort({ sequence: -1 }).select({ sequence: 1, _id: 0 }).lean()
    ]);
    return res.json({
      conversation: conversationView(conversation, null),
      recipientHead: Number(latestRecipientEvent?.sequence || 0),
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
