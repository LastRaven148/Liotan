"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const ClientInvalidation = require("../../models/ClientInvalidation");
const CryptoDevice = require("../../models/CryptoDevice");
const CryptoEvent = require("../../models/CryptoEvent");
const DeletionWorkflow = require("../../models/DeletionWorkflow");
const MessageVisibility = require("../../models/MessageVisibility");
const {
  assertWorkflowAccess,
  digest,
  normaliseIdempotencyKey,
  requestConversationDeletion,
  runDeletionWorkflow,
  workflowView
} = require("../../services/deletionWorkflow");
const { runMongoTransaction } = require("../../utils/mongoTransaction");
const { isUuid } = require("../../security/cryptoV4");
const { userRoom } = require("../../sockets/sessionRegistry");
const { assertConversationAccess, idString } = require("./shared");

function encodeCursor(item) {
  if (!item) return "";
  return Buffer.from(JSON.stringify({
    createdAt: new Date(item.createdAt).toISOString(),
    id: String(item._id)
  }), "utf8").toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!mongoose.isValidObjectId(parsed.id) || !Number.isFinite(createdAt.getTime())) throw new Error();
    return { createdAt, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    const error = new Error("invalid cursor"); error.status = 400; throw error;
  }
}

function invalidationView(item) {
  return {
    eventId: item.eventId,
    kind: item.kind,
    conversationId: item.conversationId || "",
    groupId: item.groupId ? String(item.groupId) : "",
    clientMessageId: item.clientMessageId || "",
    payloadVersion: Number(item.payloadVersion) || 1,
    createdAt: item.createdAt
  };
}

async function deleteConversation(req, res, next) {
  try {
    if (req.body.confirm !== true) return res.status(400).json({ error: "irreversible deletion confirmation required" });
    const idempotencyKey = normaliseIdempotencyKey(req.get("idempotency-key"));
    const existing = await DeletionWorkflow.findOne({
      idempotencyKeyHash: digest(`conversation:${idString(req.user.userId)}:${idempotencyKey}`)
    });
    if (existing) {
      if (existing.targetConversationId !== req.params.conversationId) {
        return res.status(409).json({ error: "idempotency key is already bound to another deletion" });
      }
      return res.status(existing.state === "completed" ? 200 : 202).json(workflowView(existing));
    }
    await assertConversationAccess(req, req.params.conversationId);
    const workflow = await requestConversationDeletion({
      userId: req.user.userId,
      username: req.user.username,
      conversationId: req.params.conversationId,
      idempotencyKey
    });
    const result = await runDeletionWorkflow({ workflowId: workflow.workflowId, io: req.app.get("io") });
    return res.status(result?.state === "completed" ? 200 : 202).json(result || workflowView(workflow));
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}

async function getDeletionStatus(req, res, next) {
  try {
    const workflow = await assertWorkflowAccess(req.params.workflowId, req.user.userId);
    return res.json(workflowView(workflow));
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}

async function listInvalidations(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 50, 100));
    const cursor = decodeCursor(req.query.cursor);
    const query = {
      recipientUserId: req.user.userId,
      acknowledgedClientIds: { $ne: req.cryptoDevice.clientId }
    };
    if (cursor) {
      query.$or = [
        { createdAt: { $gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $gt: cursor.id } }
      ];
    }
    const items = await ClientInvalidation.find(query).sort({ createdAt: 1, _id: 1 }).limit(limit + 1).lean();
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    return res.json({
      invalidations: page.map(invalidationView),
      nextCursor: hasMore ? encodeCursor(page.at(-1)) : "",
      hasMore
    });
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}

async function acknowledgeInvalidation(req, res, next) {
  try {
    const item = await ClientInvalidation.findOneAndUpdate(
      { eventId: req.params.eventId, recipientUserId: req.user.userId },
      {
        $addToSet: { acknowledgedClientIds: req.cryptoDevice.clientId },
        $pull: { pendingClientIds: req.cryptoDevice.clientId }
      },
      { returnDocument: "after" }
    );
    if (!item) return res.status(404).json({ error: "invalidation not found" });
    if (!item.pendingClientIds.length && !item.acknowledgedAt) {
      item.acknowledgedAt = new Date();
      await item.save();
    }
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function hideMessage(req, res, next) {
  try {
    const clientMessageId = String(req.params.clientMessageId || "").toLowerCase();
    if (!isUuid(clientMessageId)) return res.status(400).json({ error: "invalid message id" });
    const conversation = await assertConversationAccess(req, req.params.conversationId);
    const messageExists = await CryptoEvent.exists({
      conversationId: conversation.conversationId,
      kind: "message",
      clientMessageId
    });
    if (!messageExists) return res.status(404).json({ error: "message not found" });
    let invalidation;
    await runMongoTransaction(async session => {
      await MessageVisibility.updateOne(
        { userId: req.user.userId, conversationId: conversation.conversationId, clientMessageId },
        { $setOnInsert: { hiddenAt: new Date() } },
        { upsert: true, session }
      );
      const existing = await ClientInvalidation.findOne({
        recipientUserId: req.user.userId,
        kind: "message-hidden",
        conversationId: conversation.conversationId,
        clientMessageId
      }).session(session);
      if (existing) {
        invalidation = existing;
        return;
      }
      const devices = await CryptoDevice.find({
        userId: req.user.userId,
        status: "active",
        manifestExpiresAt: { $gt: new Date() }
      }, "clientId").session(session).lean();
      [invalidation] = await ClientInvalidation.create([{
        eventId: crypto.randomBytes(24).toString("base64url"),
        recipientUserId: req.user.userId,
        kind: "message-hidden",
        conversationId: conversation.conversationId,
        clientMessageId,
        pendingClientIds: devices.map(device => device.clientId)
      }], { session });
    });
    req.app.get("io")?.to(userRoom(idString(req.user.userId))).emit("clientInvalidationAvailable", {
      eventId: invalidation.eventId,
      kind: invalidation.kind
    });
    return res.status(201).json({ ok: true, eventId: invalidation.eventId });
  } catch (error) {
    if (error?.code === 11000) return res.status(200).json({ ok: true, duplicate: true });
    if (error?.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
}

module.exports = {
  acknowledgeInvalidation,
  decodeCursor,
  deleteConversation,
  encodeCursor,
  getDeletionStatus,
  hideMessage,
  invalidationView,
  listInvalidations
};
