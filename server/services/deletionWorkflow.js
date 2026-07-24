"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const AttachmentUpload = require("../models/AttachmentUpload");
const ClientInvalidation = require("../models/ClientInvalidation");
const CryptoConversation = require("../models/CryptoConversation");
const CryptoDevice = require("../models/CryptoDevice");
const CryptoDirectoryEntry = require("../models/CryptoDirectoryEntry");
const CryptoEvent = require("../models/CryptoEvent");
const CryptoIdentity = require("../models/CryptoIdentity");
const CryptoKeyPackage = require("../models/CryptoKeyPackage");
const CryptoOperation = require("../models/CryptoOperation");
const CryptoRequestNonce = require("../models/CryptoRequestNonce");
const DeletionObjectTask = require("../models/DeletionObjectTask");
const DeletionWorkflow = require("../models/DeletionWorkflow");
const E2EEConversation = require("../models/E2EEConversation");
const E2EEKey = require("../models/E2EEKey");
const EmailCode = require("../models/EmailCode");
const Group = require("../models/Group");
const Message = require("../models/Messages");
const MessageVisibility = require("../models/MessageVisibility");
const PendingEmailChange = require("../models/PendingEmailChange");
const RegistrationCancel = require("../models/RegistrationCancel");
const Session = require("../models/Session");
const User = require("../models/User");
const UserBlock = require("../models/UserBlock");
const UserNotificationSettings = require("../models/UserNotificationSettings");
const UserSecurity = require("../models/UserSecurity");
const { userRoom } = require("../sockets/sessionRegistry");
const deleteUploadedFile = require("../utils/deleteUploadedFile");
const getChatId = require("../utils/getChatId");
const { runMongoTransaction } = require("../utils/mongoTransaction");
const { deleteFromR2 } = require("../utils/uploadToR2");
const { releaseMediaUploadQuota } = require("./mediaQuota");

const LEASE_MS = Math.max(15_000, Number(process.env.DELETION_WORKFLOW_LEASE_MS) || 60_000);
const MAX_ATTEMPTS = Math.max(3, Number(process.env.DELETION_WORKFLOW_MAX_ATTEMPTS) || 12);
const OBJECT_BATCH_SIZE = Math.max(1, Math.min(Number(process.env.DELETION_OBJECT_BATCH_SIZE) || 50, 200));

function digest(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("base64url");
}

function idString(value) {
  return String(value?._id || value || "");
}

function randomId() {
  return crypto.randomBytes(24).toString("base64url");
}

function workflowView(workflow) {
  return {
    workflowId: workflow.workflowId,
    type: workflow.type,
    state: workflow.state,
    terminal: Boolean(workflow.terminal),
    counters: workflow.counters || {},
    retrying: !workflow.terminal && (workflow.attempts > 0 || Boolean(workflow.lastErrorCode)),
    completedAt: workflow.completedAt || null,
    updatedAt: workflow.updatedAt || null
  };
}

function normaliseIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(key)) {
    const error = new Error("valid idempotency key required");
    error.status = 400;
    throw error;
  }
  return key;
}

async function createWorkflow({ type, userId, username, conversationId = "", idempotencyKey }) {
  const requestKey = normaliseIdempotencyKey(idempotencyKey);
  const subject = type === "account" ? `account:${idString(userId)}` : `conversation:${conversationId}`;
  const subjectKeyHash = digest(subject);
  const idempotencyKeyHash = digest(`${type}:${idString(userId)}:${requestKey}`);
  let existing = await DeletionWorkflow.findOne({ idempotencyKeyHash });
  if (existing) {
    if (existing.type !== type || existing.subjectKeyHash !== subjectKeyHash) {
      const error = new Error("idempotency key is already bound to another deletion");
      error.status = 409;
      throw error;
    }
    return existing;
  }

  const active = await DeletionWorkflow.findOne({ subjectKeyHash, terminal: false });
  if (active) return active;

  try {
    return await DeletionWorkflow.create({
      workflowId: randomId(),
      type,
      subjectKeyHash,
      idempotencyKeyHash,
      requestedByUserId: userId,
      requestedByUsername: username,
      accountUserId: type === "account" ? userId : null,
      accountUsername: type === "account" ? username : "",
      targetConversationId: conversationId
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    existing = await DeletionWorkflow.findOne({
      $or: [{ idempotencyKeyHash }, { subjectKeyHash, terminal: false }]
    });
    if (existing) {
      if (existing.type !== type || existing.subjectKeyHash !== subjectKeyHash) {
        const conflict = new Error("idempotency key is already bound to another deletion");
        conflict.status = 409;
        throw conflict;
      }
      return existing;
    }
    throw error;
  }
}

async function requestAccountDeletion(input) {
  return createWorkflow({ ...input, type: "account" });
}

async function requestConversationDeletion(input) {
  return createWorkflow({ ...input, type: "conversation" });
}

async function assertWorkflowAccess(workflowId, userId) {
  const workflow = await DeletionWorkflow.findOne({ workflowId });
  if (!workflow || idString(workflow.requestedByUserId) !== idString(userId)) {
    const error = new Error("deletion workflow not found");
    error.status = 404;
    throw error;
  }
  return workflow;
}

async function claimWorkflow(workflowId = "", owner = randomId()) {
  const now = new Date();
  const query = {
    terminal: false,
    nextAttemptAt: { $lte: now },
    $or: [
      { leaseExpiresAt: null },
      { leaseExpiresAt: { $lte: now } },
      { leaseOwner: owner }
    ]
  };
  if (workflowId) query.workflowId = workflowId;
  const workflow = await DeletionWorkflow.findOneAndUpdate(
    query,
    {
      $set: { leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
      $inc: { claimCount: 1 }
    },
    { returnDocument: "after", sort: { nextAttemptAt: 1, createdAt: 1 } }
  );
  return { workflow, owner };
}

async function renewLease(workflow, owner) {
  const result = await DeletionWorkflow.updateOne(
    { _id: workflow._id, terminal: false, leaseOwner: owner },
    { $set: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } }
  );
  if (result.modifiedCount !== 1) {
    const error = new Error("deletion workflow lease lost");
    error.code = "DELETION_LEASE_LOST";
    throw error;
  }
}

function privateLegacyIds(usernames) {
  if (usernames.length !== 2) return [];
  return [getChatId(usernames[0], usernames[1]), getChatId.getLegacyChatId(usernames[0], usernames[1])];
}

function messageQuery(workflow) {
  const groupIds = workflow.groupIds || [];
  const legacyIds = workflow.legacyConversationIds || [];
  const clauses = [];
  if (groupIds.length) clauses.push({ chatType: "group", groupId: { $in: groupIds } });
  if (legacyIds.length) clauses.push({ chatId: { $in: legacyIds } });
  if (workflow.type === "account" && workflow.accountUsername) {
    clauses.push({ from: workflow.accountUsername }, { to: workflow.accountUsername }, { deletedFor: workflow.accountUsername });
  }
  return clauses.length ? { $or: clauses } : { _id: null };
}

function objectCandidates(file, source) {
  if (!file) return [];
  const directKey = deleteUploadedFile.normalizeR2Key(file.storageKey || file.avatarStorageKey);
  const sourceUrl = file.url || file.mediaUrl || file.avatar || "";
  const urlKey = deleteUploadedFile.extractR2KeyFromUrl(sourceUrl);
  const storageType = file.storageType || file.avatarStorageType || "";
  const storageClass = storageType === "r2:public-avatar" || source.endsWith("avatar")
    ? "public-avatar"
    : "private-media";
  const result = [];
  if (directKey || urlKey) {
    result.push({
      locator: directKey || urlKey,
      storageType: String(storageType || `r2:${storageClass}`),
      storageClass,
      source,
      sourceId: idString(file),
      referenceValues: [...new Set([directKey, urlKey, sourceUrl].filter(Boolean))]
    });
  }
  for (const value of [file.url, file.mediaUrl, file.avatar]) {
    if (String(value || "").startsWith("/uploads/")) {
      result.push({
        locator: String(value),
        storageType: "local",
        storageClass,
        source,
        sourceId: idString(file),
        referenceValues: [String(value)]
      });
    }
  }
  return result;
}

async function excludeExternallyReferencedCandidates(candidates, { messages, uploads, account, groups }) {
  if (!candidates.length) return { exclusive: [], retainedShared: 0 };
  const values = [...new Set(candidates.flatMap(item => item.referenceValues || [item.locator]).filter(Boolean))];
  const messageIds = messages.map(idString);
  const uploadIds = uploads.map(idString);
  const groupIds = groups.map(idString);
  const accountIds = account ? [idString(account)] : [];
  const [externalUploads, externalMessages, externalUsers, externalGroups] = await Promise.all([
    AttachmentUpload.find({
      _id: { $nin: uploadIds },
      $or: [{ storageKey: { $in: values } }, { url: { $in: values } }, { mediaUrl: { $in: values } }]
    }, "storageKey url mediaUrl").lean(),
    Message.find({
      _id: { $nin: messageIds },
      $or: [
        { "attachment.storageKey": { $in: values } },
        { "attachment.url": { $in: values } },
        { "attachment.mediaUrl": { $in: values } }
      ]
    }, "attachment.storageKey attachment.url attachment.mediaUrl").lean(),
    User.find({
      _id: { $nin: accountIds },
      $or: [{ avatarStorageKey: { $in: values } }, { avatar: { $in: values } }]
    }, "avatarStorageKey avatar").lean(),
    Group.find({
      _id: { $nin: groupIds },
      $or: [{ avatarStorageKey: { $in: values } }, { avatar: { $in: values } }]
    }, "avatarStorageKey avatar").lean()
  ]);
  const externalValues = new Set([
    ...externalUploads.flatMap(item => [item.storageKey, item.url, item.mediaUrl]),
    ...externalMessages.flatMap(item => [item.attachment?.storageKey, item.attachment?.url, item.attachment?.mediaUrl]),
    ...externalUsers.flatMap(item => [item.avatarStorageKey, item.avatar]),
    ...externalGroups.flatMap(item => [item.avatarStorageKey, item.avatar])
  ].filter(Boolean));
  const exclusive = candidates.filter(item => !(item.referenceValues || [item.locator]).some(value => externalValues.has(value)));
  return { exclusive, retainedShared: candidates.length - exclusive.length };
}

async function planWorkflow(workflow, owner) {
  await runMongoTransaction(async session => {
    const current = await DeletionWorkflow.findOne({ _id: workflow._id, state: "requested", leaseOwner: owner }).session(session);
    if (!current) return;
    let conversations;
    let groups;
    let legacyConversations;
    let legacyMessages = [];
    let accountClientIds = [];
    let accountEmailHash = "";
    if (current.type === "account") {
      const user = await User.findOne({ _id: current.accountUserId, username: current.accountUsername }).session(session);
      if (!user) {
        const error = new Error("account not found"); error.status = 404; throw error;
      }
      accountEmailHash = String(user.emailHash || "");
      conversations = await CryptoConversation.find({ participantUserIds: user._id }).session(session).lean();
      accountClientIds = (await CryptoDevice.find({ userId: user._id }, "clientId").session(session).lean())
        .map(device => device.clientId);
      groups = await Group.find({ members: user.username }).session(session).lean();
      legacyConversations = await E2EEConversation.find({ participants: user.username }).session(session).lean();
      legacyMessages = await Message.find({
        $or: [{ from: user.username }, { to: user.username }, { deletedFor: user.username }]
      }, "chatType groupId chatId from to").session(session).lean();
    } else {
      const conversation = await CryptoConversation.findOne({
        conversationId: current.targetConversationId,
        participantUserIds: current.requestedByUserId,
        lifecycleState: { $ne: "deleting" }
      }).session(session).lean();
      if (!conversation) {
        const error = new Error("conversation not found"); error.status = 404; throw error;
      }
      conversations = [conversation];
      groups = conversation.groupId
        ? await Group.find({ _id: conversation.groupId }).session(session).lean()
        : [];
      legacyConversations = conversation.chatType === "private"
        ? await E2EEConversation.find({ participants: { $all: conversation.participantUsernames } }).session(session).lean()
        : await E2EEConversation.find({ conversationId: `group:${conversation.groupId}` }).session(session).lean();
    }

    const conversationIds = [...new Set(conversations.map(item => item.conversationId).filter(Boolean))];
    const groupIds = [...new Map(groups.map(group => [idString(group._id), group._id])).values()];
    const participantUsernames = [...new Set([
      ...conversations.flatMap(item => item.participantUsernames || []),
      ...groups.flatMap(group => group.members || []),
      ...legacyConversations.flatMap(item => item.participants || []),
      ...legacyMessages.flatMap(item => [item.from, item.to])
    ].filter(Boolean))];
    const participantUsers = participantUsernames.length
      ? await User.find({ username: { $in: participantUsernames } }, "username").session(session).lean()
      : [];
    const userIdByUsername = new Map(participantUsers.map(user => [user.username, user._id]));
    const participantUserIds = [...new Map([
      ...conversations.flatMap(item => item.participantUserIds || []),
      ...participantUsers.map(item => item._id)
    ].map(id => [idString(id), id])).values()];
    const legacyConversationIds = [...new Set([
      ...legacyConversations.map(item => item.conversationId),
      ...legacyMessages.map(item => item.chatId),
      ...conversations.flatMap(item => item.chatType === "private" ? privateLegacyIds(item.participantUsernames) : [`group:${item.groupId}`])
    ].filter(Boolean))];
    const targetConversation = conversations.find(item => item.conversationId === current.targetConversationId);
    const invalidationTargets = conversations.map(item => ({
      conversationId: item.conversationId,
      chatType: item.chatType,
      groupId: item.groupId || null,
      participantUserIds: item.participantUserIds || [],
      participantUsernames: item.participantUsernames || []
    }));
    if (current.type === "account") {
      const representedGroups = new Set(conversations.filter(item => item.groupId).map(item => idString(item.groupId)));
      for (const group of groups) {
        if (representedGroups.has(idString(group._id))) continue;
        invalidationTargets.push({
          conversationId: "",
          chatType: "group",
          groupId: group._id,
          participantUserIds: (group.members || []).map(name => userIdByUsername.get(name)).filter(Boolean),
          participantUsernames: group.members || []
        });
      }
      const representedPrivateRosters = new Set(conversations
        .filter(item => item.chatType === "private")
        .map(item => [...(item.participantUsernames || [])].sort().join("\u0000")));
      for (const legacy of legacyConversations) {
        if (String(legacy.conversationId || "").startsWith("group:")) continue;
        const names = [...new Set(legacy.participants || [])];
        const rosterKey = [...names].sort().join("\u0000");
        if (names.length < 2 || representedPrivateRosters.has(rosterKey)) continue;
        representedPrivateRosters.add(rosterKey);
        invalidationTargets.push({
          conversationId: "",
          chatType: "private",
          groupId: null,
          participantUserIds: names.map(name => userIdByUsername.get(name)).filter(Boolean),
          participantUsernames: names
        });
      }
      for (const message of legacyMessages) {
        if (message.chatType === "group" || message.groupId) continue;
        const names = [...new Set([message.from, message.to].filter(Boolean))];
        const rosterKey = [...names].sort().join("\u0000");
        if (names.length < 2 || representedPrivateRosters.has(rosterKey)) continue;
        representedPrivateRosters.add(rosterKey);
        invalidationTargets.push({
          conversationId: "",
          chatType: "private",
          groupId: null,
          participantUserIds: names.map(name => userIdByUsername.get(name)).filter(Boolean),
          participantUsernames: names
        });
      }
    }
    current.invalidationTargets = invalidationTargets;
    current.accountEmailHash = accountEmailHash;
    current.accountClientIds = accountClientIds;
    current.conversationIds = conversationIds;
    current.groupIds = groupIds;
    current.participantUserIds = participantUserIds;
    current.participantUsernames = participantUsernames;
    current.legacyConversationIds = legacyConversationIds;
    current.targetLookupKeyHash = targetConversation ? digest(targetConversation.lookupKey) : "";
    current.counters.conversations = invalidationTargets.length;
    current.counters.groups = groupIds.length;
    current.state = "planning";
    await current.save({ session });
  });

  await DeletionWorkflow.updateOne(
    { _id: workflow._id, state: "planning", leaseOwner: owner },
    { $set: { state: "planned" } }
  );
}

async function planWorkflowObjects(workflow, owner) {
  const frozen = await DeletionWorkflow.findOne({
    _id: workflow._id,
    state: "frozen",
    objectPlanCompleted: false,
    leaseOwner: owner
  });
  if (!frozen) return;
  const [messages, uploads, account, groups] = await Promise.all([
    Message.find(messageQuery(frozen)).lean(),
    AttachmentUpload.find({
      $or: [
        ...(frozen.conversationIds.length ? [{ cryptoConversationId: { $in: frozen.conversationIds } }] : []),
        ...(frozen.type === "account" ? [{ owner: frozen.accountUsername }] : [])
      ]
    }).lean(),
    frozen.type === "account" ? User.findById(frozen.accountUserId).lean() : null,
    frozen.groupIds.length ? Group.find({ _id: { $in: frozen.groupIds } }).lean() : []
  ]);
  const candidates = [
    ...objectCandidates(account, "account-avatar"),
    ...groups.flatMap(group => objectCandidates(group, "group-avatar")),
    ...messages.flatMap(message => objectCandidates(message.attachment, "message")),
    ...uploads.flatMap(upload => objectCandidates(upload, "attachment-upload"))
  ];
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.storageType}:${candidate.locator}`;
    const existing = unique.get(key);
    if (existing) {
      existing.referenceValues = [...new Set([...existing.referenceValues, ...candidate.referenceValues])];
    } else {
      unique.set(key, candidate);
    }
  }
  const ownership = await excludeExternallyReferencedCandidates([...unique.values()], {
    messages,
    uploads,
    account,
    groups
  });
  const exclusive = new Map(ownership.exclusive.map(item => [`${item.storageType}:${item.locator}`, item]));
  if (exclusive.size) {
    await DeletionObjectTask.insertMany([...exclusive.values()].map(item => ({
      workflowId: frozen.workflowId,
      locatorHash: digest(`${item.storageType}:${item.locator}`),
      locator: item.locator,
      storageType: item.storageType,
      storageClass: item.storageClass,
      source: item.source
    })), { ordered: false }).catch(error => {
      if (error?.code !== 11000 && !error?.writeErrors?.every(item => item.code === 11000)) throw error;
    });
  }
  await DeletionWorkflow.updateOne(
    { _id: frozen._id, leaseOwner: owner, state: "frozen", objectPlanCompleted: false },
    {
      $set: {
        objectPlanCompleted: true,
        "counters.messages": messages.length,
        "counters.mediaObjects": exclusive.size,
        "counters.sharedMediaRetained": ownership.retainedShared
      }
    }
  );
}

async function freezeWorkflow(workflow, owner) {
  await runMongoTransaction(async session => {
    const current = await DeletionWorkflow.findOne({ _id: workflow._id, state: "planned", leaseOwner: owner }).session(session);
    if (!current) return;
    if (current.type === "account") {
      const frozenUser = await User.updateOne(
        { _id: current.accountUserId, lifecycleState: { $ne: "deleting" } },
        { $set: { lifecycleState: "deleting", deletionWorkflowId: current.workflowId } },
        { session }
      );
      const alreadyFrozen = await User.exists({
        _id: current.accountUserId,
        lifecycleState: "deleting",
        deletionWorkflowId: current.workflowId
      }).session(session);
      if (frozenUser.modifiedCount !== 1 && !alreadyFrozen) {
        const error = new Error("account deletion conflicts with another workflow"); error.status = 409; throw error;
      }
    }
    const conversationConflict = await CryptoConversation.exists({
      conversationId: { $in: current.conversationIds },
      lifecycleState: "deleting",
      deletionWorkflowId: { $ne: current.workflowId }
    }).session(session);
    const groupConflict = await Group.exists({
      _id: { $in: current.groupIds },
      lifecycleState: "deleting",
      deletionWorkflowId: { $ne: current.workflowId }
    }).session(session);
    if (conversationConflict || groupConflict) {
      const error = new Error("deletion conflicts with another workflow"); error.status = 409; throw error;
    }
    await Promise.all([
      CryptoConversation.updateMany(
        { conversationId: { $in: current.conversationIds } },
        {
          $set: {
            lifecycleState: "deleting",
            deletionWorkflowId: current.workflowId,
            blockedForEpochChange: true
          },
          $inc: { deletionGeneration: 1, operationGeneration: 1 }
        },
        { session }
      ),
      Group.updateMany(
        { _id: { $in: current.groupIds } },
        { $set: { lifecycleState: "deleting", deletionWorkflowId: current.workflowId } },
        { session }
      ),
      CryptoOperation.updateMany(
        { conversationId: { $in: current.conversationIds }, status: "pending" },
        { $set: { status: "cancelled", cancellationReason: "conversation deletion" } },
        { session }
      ),
      AttachmentUpload.updateMany(
        {
          $or: [
            { cryptoConversationId: { $in: current.conversationIds } },
            ...(current.type === "account" ? [{ owner: current.accountUsername }] : [])
          ]
        },
        { $set: { lifecycleState: "deletion-pending", expiresAt: new Date() } },
        { session }
      )
    ]);
    current.state = "frozen";
    await current.save({ session });
  });
}

function retryDelay(attempts) {
  return Math.min(6 * 60 * 60 * 1000, 1000 * (2 ** Math.min(12, Math.max(0, attempts - 1))));
}

async function deleteObjectTask(task, adapters) {
  if (task.storageType === "local") {
    await adapters.deleteLocal(task.locator);
  } else {
    await adapters.deleteR2(task.locator, { storageClass: task.storageClass });
  }
}

async function deleteWorkflowObjects(workflow, owner, adapters) {
  const transition = await DeletionWorkflow.updateOne(
    {
      _id: workflow._id,
      leaseOwner: owner,
      objectPlanCompleted: true,
      state: { $in: ["frozen", "media-deleting"] }
    },
    { $set: { state: "media-deleting" } }
  );
  if (transition.matchedCount !== 1) {
    const error = new Error("deletion object inventory is incomplete");
    error.code = "DELETION_OBJECT_PLAN_INCOMPLETE";
    throw error;
  }
  const tasks = await DeletionObjectTask.find({
    workflowId: workflow.workflowId,
    state: "pending",
    nextAttemptAt: { $lte: new Date() }
  }).sort({ createdAt: 1 }).limit(OBJECT_BATCH_SIZE);
  for (const task of tasks) {
    await renewLease(workflow, owner);
    try {
      await deleteObjectTask(task, adapters);
      task.state = "deleted";
      task.deletedAt = new Date();
      task.lastErrorCode = "";
      await task.save();
    } catch (error) {
      task.attempts += 1;
      task.lastErrorCode = String(error?.code || error?.name || "OBJECT_DELETE_FAILED").slice(0, 80);
      task.nextAttemptAt = new Date(Date.now() + retryDelay(task.attempts));
      if (task.attempts >= MAX_ATTEMPTS) task.state = "dead-letter";
      await task.save();
      const terminal = task.state === "dead-letter";
      await DeletionWorkflow.updateOne(
        { _id: workflow._id, leaseOwner: owner },
        {
          $set: {
            state: terminal ? "dead-letter" : "media-deleting",
            terminal,
            nextAttemptAt: task.nextAttemptAt,
            lastErrorCode: task.lastErrorCode,
            leaseOwner: "",
            leaseExpiresAt: null
          }
        }
      );
      return false;
    }
  }
  const blocked = await DeletionObjectTask.findOne({ workflowId: workflow.workflowId, state: "dead-letter" });
  if (blocked) {
    await DeletionWorkflow.updateOne(
      { _id: workflow._id, leaseOwner: owner },
      {
        $set: {
          state: "dead-letter",
          terminal: true,
          lastErrorCode: blocked.lastErrorCode || "OBJECT_DELETE_DEAD_LETTER",
          leaseOwner: "",
          leaseExpiresAt: null
        }
      }
    );
    return false;
  }
  const remaining = await DeletionObjectTask.findOne({ workflowId: workflow.workflowId, state: "pending" });
  if (remaining) {
    await DeletionWorkflow.updateOne(
      { _id: workflow._id, leaseOwner: owner },
      { $set: { nextAttemptAt: remaining.nextAttemptAt, leaseOwner: "", leaseExpiresAt: null } }
    );
    return false;
  }
  return true;
}

async function createInvalidations(current, session) {
  const targets = current.invalidationTargets?.length
    ? current.invalidationTargets
    : [{
        conversationId: current.targetConversationId || current.conversationIds[0] || "",
        chatType: current.groupIds?.length ? "group" : "private",
        groupId: current.groupIds?.[0] || null,
        participantUserIds: current.participantUserIds,
        participantUsernames: current.participantUsernames
      }];
  const recipientIds = [...new Map(targets
    .flatMap(target => target.participantUserIds || [])
    .filter(id => current.type !== "account" || idString(id) !== idString(current.accountUserId))
    .map(id => [idString(id), id])).values()];
  if (!recipientIds.length) return [];
  const [devices, users] = await Promise.all([
    CryptoDevice.find({
      userId: { $in: recipientIds },
      status: "active",
      manifestExpiresAt: { $gt: new Date() }
    }, "userId clientId").session(session).lean(),
    User.find({ _id: { $in: recipientIds } }, "username").session(session).lean()
  ]);
  const usernameById = new Map(users.map(user => [idString(user._id), user.username]));
  const documents = [];
  for (const target of targets) {
    for (const userId of target.participantUserIds || []) {
      if (current.type === "account" && idString(userId) === idString(current.accountUserId)) continue;
      const recipientUsername = usernameById.get(idString(userId));
      if (!recipientUsername) continue;
      const chatKey = target.chatType === "group"
        ? `group:${idString(target.groupId)}`
        : String((target.participantUsernames || []).find(name => name !== recipientUsername) || "");
      documents.push({
        eventId: randomId(),
        recipientUserId: userId,
        kind: current.type === "account" ? "account-deleted" : "conversation-deleted",
        conversationId: target.conversationId,
        chatKey,
        groupId: target.groupId || null,
        pendingClientIds: devices.filter(device => idString(device.userId) === idString(userId)).map(device => device.clientId)
      });
    }
  }
  return ClientInvalidation.insertMany(documents, { session });
}

async function deleteMongoData(workflow, owner) {
  return runMongoTransaction(async session => {
    const current = await DeletionWorkflow.findOne({
      _id: workflow._id,
      state: "media-deleting",
      leaseOwner: owner
    }).session(session);
    if (!current) return [];
    const invalidations = await createInvalidations(current, session);
    const messageFilter = messageQuery(current);
    const accountUser = current.type === "account"
      ? await User.findById(current.accountUserId).session(session).lean()
      : null;
    const cryptoClients = current.type === "account"
      ? await CryptoDevice.find({ userId: current.accountUserId }, "clientId").session(session).lean()
      : [];
    const attachmentQuery = {
      $or: [
        { cryptoConversationId: { $in: current.conversationIds } },
        ...(current.type === "account" ? [{ owner: current.accountUsername }] : [])
      ]
    };
    const quotaUploads = await AttachmentUpload.find(
      attachmentQuery,
      "uploadId"
    ).session(session).lean();
    for (const upload of quotaUploads) {
      await releaseMediaUploadQuota(upload.uploadId, { session });
    }
    const pinnedKeys = [...new Set([
      ...current.participantUsernames,
      ...current.groupIds.map(id => `group:${id}`)
    ])];
    await Promise.all([
      AttachmentUpload.deleteMany(attachmentQuery, { session }),
      CryptoEvent.deleteMany({ conversationId: { $in: current.conversationIds } }, { session }),
      CryptoOperation.deleteMany({
        $or: [
          { conversationId: { $in: current.conversationIds } },
          ...(current.type === "account" ? [{ requestedByUserId: current.accountUserId }] : [])
        ]
      }, { session }),
      MessageVisibility.deleteMany({
        $or: [
          { conversationId: { $in: current.conversationIds } },
          ...(current.type === "account" ? [{ userId: current.accountUserId }] : [])
        ]
      }, { session }),
      CryptoConversation.deleteMany({
        conversationId: { $in: current.conversationIds },
        deletionWorkflowId: current.workflowId
      }, { session }),
      Message.deleteMany(messageFilter, { session }),
      E2EEKey.deleteMany({
        $or: [
          { conversationId: { $in: current.legacyConversationIds } },
          ...(current.type === "account" ? [{ user: current.accountUsername }] : [])
        ]
      }, { session }),
      E2EEConversation.deleteMany({ conversationId: { $in: current.legacyConversationIds } }, { session }),
      Group.deleteMany({ _id: { $in: current.groupIds }, deletionWorkflowId: current.workflowId }, { session }),
      User.updateMany({}, { $pull: { pinnedChats: { $in: pinnedKeys }, archivedChats: { $in: pinnedKeys } } }, { session })
    ]);
    if (current.type === "account") {
      const clientIds = cryptoClients.map(device => device.clientId);
      const emailClauses = accountUser?.emailHash ? [{ emailHash: accountUser.emailHash }] : [];
      await Promise.all([
        CryptoKeyPackage.deleteMany({ userId: current.accountUserId }, { session }),
        CryptoRequestNonce.deleteMany({ clientId: { $in: clientIds } }, { session }),
        CryptoDirectoryEntry.deleteMany({ userId: current.accountUserId }, { session }),
        CryptoDevice.deleteMany({ userId: current.accountUserId }, { session }),
        CryptoIdentity.deleteMany({ userId: current.accountUserId }, { session }),
        Session.deleteMany({ $or: [{ userId: current.accountUserId }, { username: current.accountUsername }] }, { session }),
        UserSecurity.deleteMany({ $or: [{ userId: current.accountUserId }, { username: current.accountUsername }] }, { session }),
        RegistrationCancel.deleteMany({ $or: [{ userId: current.accountUserId }, { username: current.accountUsername }] }, { session }),
        PendingEmailChange.deleteMany({
          $or: [
            { userId: current.accountUserId },
            { username: current.accountUsername },
            ...(accountUser?.emailHash ? [{ oldEmailHash: accountUser.emailHash }, { newEmailHash: accountUser.emailHash }] : [])
          ]
        }, { session }),
        UserNotificationSettings.deleteMany({ userId: current.accountUserId }, { session }),
        UserBlock.deleteMany({
          $or: [{ blockerUserId: current.accountUserId }, { blockedUserId: current.accountUserId }]
        }, { session }),
        ClientInvalidation.deleteMany({ recipientUserId: current.accountUserId }, { session }),
        ...(emailClauses.length ? [EmailCode.deleteMany({ $or: emailClauses }, { session })] : [])
      ]);
      await User.deleteOne({
        _id: current.accountUserId,
        lifecycleState: "deleting",
        deletionWorkflowId: current.workflowId
      }, { session });
    }
    current.state = "invalidating";
    current.counters.invalidations = invalidations.length;
    current.lastErrorCode = "";
    await current.save({ session });
    return invalidations;
  });
}

function emitInvalidations(io, invalidations) {
  if (!io) return;
  for (const item of invalidations || []) {
    io.to(userRoom(idString(item.recipientUserId))).emit("clientInvalidationAvailable", {
      eventId: item.eventId,
      kind: item.kind
    });
  }
}

async function reconcileWorkflow(workflow, owner) {
  const current = await DeletionWorkflow.findOne({ _id: workflow._id, leaseOwner: owner });
  if (!current || current.state !== "invalidating") return;
  const attachmentQuery = {
    $or: [
      ...(current.conversationIds.length ? [{ cryptoConversationId: { $in: current.conversationIds } }] : []),
      ...(current.type === "account" ? [{ owner: current.accountUsername }] : [])
    ]
  };
  const checks = [
    CryptoConversation.countDocuments({ conversationId: { $in: current.conversationIds } }),
    CryptoEvent.countDocuments({ conversationId: { $in: current.conversationIds } }),
    CryptoOperation.countDocuments({
      $or: [
        { conversationId: { $in: current.conversationIds } },
        ...(current.type === "account" ? [{ requestedByUserId: current.accountUserId }] : [])
      ]
    }),
    AttachmentUpload.countDocuments(attachmentQuery),
    Group.countDocuments({ _id: { $in: current.groupIds } }),
    Message.countDocuments(messageQuery(current)),
    MessageVisibility.countDocuments({
      $or: [
        { conversationId: { $in: current.conversationIds } },
        ...(current.type === "account" ? [{ userId: current.accountUserId }] : [])
      ]
    }),
    E2EEConversation.countDocuments({ conversationId: { $in: current.legacyConversationIds } }),
    E2EEKey.countDocuments({
      $or: [
        { conversationId: { $in: current.legacyConversationIds } },
        ...(current.type === "account" ? [{ user: current.accountUsername }] : [])
      ]
    }),
    DeletionObjectTask.countDocuments({ workflowId: current.workflowId, state: { $ne: "deleted" } })
  ];
  if (current.type === "account") {
    const accountSelector = { $or: [{ userId: current.accountUserId }, { username: current.accountUsername }] };
    checks.push(
      CryptoKeyPackage.countDocuments({ userId: current.accountUserId }),
      CryptoRequestNonce.countDocuments({ clientId: { $in: current.accountClientIds } }),
      CryptoDirectoryEntry.countDocuments({ userId: current.accountUserId }),
      CryptoDevice.countDocuments({ userId: current.accountUserId }),
      CryptoIdentity.countDocuments({ userId: current.accountUserId }),
      Session.countDocuments(accountSelector),
      UserSecurity.countDocuments(accountSelector),
      RegistrationCancel.countDocuments(accountSelector),
      PendingEmailChange.countDocuments({
        $or: [
          ...accountSelector.$or,
          ...(current.accountEmailHash
            ? [{ oldEmailHash: current.accountEmailHash }, { newEmailHash: current.accountEmailHash }]
            : [])
        ]
      }),
      UserNotificationSettings.countDocuments({ userId: current.accountUserId }),
      UserBlock.countDocuments({
        $or: [{ blockerUserId: current.accountUserId }, { blockedUserId: current.accountUserId }]
      }),
      ClientInvalidation.countDocuments({ recipientUserId: current.accountUserId }),
      ...(current.accountEmailHash ? [EmailCode.countDocuments({ emailHash: current.accountEmailHash })] : [])
    );
  }
  const remaining = await Promise.all(checks);
  if (remaining.some(Boolean)) {
    const error = new Error("deletion reconciliation found remaining records");
    error.code = "DELETION_RECONCILIATION_FAILED";
    throw error;
  }
  if (current.type === "account" && await User.exists({ _id: current.accountUserId })) {
    const error = new Error("account deletion reconciliation found the account");
    error.code = "DELETION_RECONCILIATION_FAILED";
    throw error;
  }
  const now = new Date();
  const unset = {
    leaseOwner: "",
    leaseExpiresAt: null,
    nextAttemptAt: now,
    lastErrorCode: ""
  };
  const update = {
    $set: { ...unset, state: "completed", terminal: true, completedAt: now },
    $unset: {}
  };
  if (current.type === "account") {
    update.$set.anonymizedAt = now;
    update.$unset = {
      requestedByUserId: 1,
      requestedByUsername: 1,
      accountUserId: 1,
      accountUsername: 1,
      accountEmailHash: 1,
      accountClientIds: 1,
      participantUserIds: 1,
      participantUsernames: 1,
      invalidationTargets: 1,
      legacyConversationIds: 1,
      groupIds: 1
    };
  }
  await runMongoTransaction(async session => {
    const finalized = await DeletionWorkflow.updateOne(
      { _id: current._id, leaseOwner: owner, state: "invalidating" },
      update,
      { session }
    );
    if (finalized.matchedCount !== 1) {
      const error = new Error("deletion workflow lease lost during finalization");
      error.code = "DELETION_LEASE_LOST";
      throw error;
    }
    await DeletionObjectTask.deleteMany(
      { workflowId: current.workflowId, state: "deleted" },
      { session }
    );
  });
}

async function failWorkflow(workflow, owner, error) {
  const attempts = Number(workflow.attempts || 0) + 1;
  const terminal = attempts >= MAX_ATTEMPTS && !error?.status;
  await DeletionWorkflow.updateOne(
    { _id: workflow._id, leaseOwner: owner, terminal: false },
    {
      $set: {
        state: terminal ? "dead-letter" : workflow.state,
        terminal,
        leaseOwner: "",
        leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + retryDelay(attempts)),
        lastErrorCode: String(error?.code || error?.name || "DELETION_WORKFLOW_FAILED").slice(0, 80)
      },
      $inc: { attempts: 1 }
    }
  );
}

async function runDeletionWorkflow({ workflowId = "", io = null, adapters = {}, hooks = {} } = {}) {
  const claimed = await claimWorkflow(workflowId);
  if (!claimed.workflow) return null;
  const workflow = claimed.workflow;
  const owner = claimed.owner;
  const effectiveAdapters = {
    deleteR2: adapters.deleteR2 || deleteFromR2,
    deleteLocal: adapters.deleteLocal || (url => deleteUploadedFile(url, { strict: true }))
  };
  try {
    if (["requested", "planning"].includes(workflow.state)) await planWorkflow(workflow, owner);
    await renewLease(workflow, owner);
    let current = await DeletionWorkflow.findById(workflow._id);
    if (current.state === "planned") await freezeWorkflow(current, owner);
    await renewLease(workflow, owner);
    current = await DeletionWorkflow.findById(workflow._id);
    if (current.state === "frozen" && !current.objectPlanCompleted) {
      await hooks.afterFreeze?.({
        workflowId: current.workflowId,
        type: current.type,
        conversationIds: [...current.conversationIds]
      });
      await planWorkflowObjects(current, owner);
    }
    await renewLease(workflow, owner);
    current = await DeletionWorkflow.findById(workflow._id);
    if (["frozen", "media-deleting"].includes(current.state)) {
      const complete = await deleteWorkflowObjects(current, owner, effectiveAdapters);
      if (!complete) return workflowView(await DeletionWorkflow.findById(workflow._id));
    }
    await renewLease(workflow, owner);
    current = await DeletionWorkflow.findById(workflow._id);
    if (current.state === "media-deleting") {
      const invalidations = await deleteMongoData(current, owner);
      emitInvalidations(io, invalidations);
    }
    await renewLease(workflow, owner);
    current = await DeletionWorkflow.findById(workflow._id);
    if (current.state === "invalidating") await reconcileWorkflow(current, owner);
    return workflowView(await DeletionWorkflow.findById(workflow._id));
  } catch (error) {
    await failWorkflow(await DeletionWorkflow.findById(workflow._id), owner, error).catch(() => {});
    throw error;
  }
}

module.exports = {
  LEASE_MS,
  MAX_ATTEMPTS,
  OBJECT_BATCH_SIZE,
  assertWorkflowAccess,
  claimWorkflow,
  digest,
  normaliseIdempotencyKey,
  requestAccountDeletion,
  requestConversationDeletion,
  runDeletionWorkflow,
  workflowView
};
