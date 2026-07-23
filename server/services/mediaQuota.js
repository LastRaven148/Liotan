"use strict";

const crypto = require("crypto");
const MediaQuotaBucket = require("../models/MediaQuotaBucket");
const MediaQuotaState = require("../models/MediaQuotaState");
const MediaTransferReservation = require("../models/MediaTransferReservation");
const AttachmentUpload = require("../models/AttachmentUpload");
const { hmac, hashRequestIp } = require("../utils/securityIds");
const { hashSessionId } = require("../utils/sessionSecurity");
const { runMongoTransaction } = require("../utils/mongoTransaction");

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const RESERVATION_TTL_MS = 15 * 60 * 1000;
const WINDOWS = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000
};

const DEFAULTS = {
  upload: {
    minute: { bytes: 256 * MIB, requests: 30 },
    hour: { bytes: 1024 * MIB, requests: 240 },
    day: { bytes: 4 * GIB, requests: 1000 }
  },
  download: {
    minute: { bytes: 512 * MIB, requests: 240 },
    hour: { bytes: 4 * GIB, requests: 2000 },
    day: { bytes: 16 * GIB, requests: 8000 }
  }
};

const SCOPE_FACTOR = {
  global: 1000,
  account: 1,
  device: 1,
  session: 1,
  ip: 4
};

const STATE_DEFAULTS = {
  global: {
    activeUploads: 256,
    activeDownloads: 1024,
    storageBytes: 10 * 1024 * GIB,
    objects: 10_000_000
  },
  account: {
    activeUploads: 4,
    activeDownloads: 16,
    storageBytes: 10 * GIB,
    objects: 10_000
  },
  device: {
    activeUploads: 2,
    activeDownloads: 8,
    storageBytes: 10 * GIB,
    objects: 10_000
  },
  session: {
    activeUploads: 2,
    activeDownloads: 8,
    storageBytes: 10 * GIB,
    objects: 10_000
  },
  ip: {
    activeUploads: 16,
    activeDownloads: 64,
    storageBytes: 40 * GIB,
    objects: 40_000
  }
};

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function envName(...parts) {
  return `MEDIA_QUOTA_${parts.join("_").toUpperCase()}`;
}

function windowLimit(scope, direction, window) {
  const factor = SCOPE_FACTOR[scope];
  const fallback = DEFAULTS[direction][window];
  return {
    bytes: positiveInteger(
      process.env[envName(scope, direction, window, "bytes")],
      fallback.bytes * factor
    ),
    requests: positiveInteger(
      process.env[envName(scope, direction, window, "requests")],
      fallback.requests * factor
    )
  };
}

function stateLimit(scope) {
  const fallback = STATE_DEFAULTS[scope];
  return {
    activeUploads: positiveInteger(
      process.env[envName(scope, "active", "uploads")],
      fallback.activeUploads
    ),
    activeDownloads: positiveInteger(
      process.env[envName(scope, "active", "downloads")],
      fallback.activeDownloads
    ),
    storageBytes: positiveInteger(
      process.env[envName(scope, "storage", "bytes")],
      fallback.storageBytes
    ),
    objects: positiveInteger(
      process.env[envName(scope, "storage", "objects")],
      fallback.objects
    )
  };
}

function quotaError(message = "encrypted media quota exceeded") {
  const err = new Error(message);
  err.status = 429;
  err.code = "MEDIA_QUOTA_EXCEEDED";
  return err;
}

function scopeHash(scope, value) {
  return hmac(`media-quota:${scope}:${String(value || "unknown")}`);
}

function transferScopes(req) {
  const values = {
    global: "global",
    account: req.user?.userId,
    device: req.cryptoDevice?.clientId,
    session: hashSessionId(req.user?.sid),
    ip: hashRequestIp(req)
  };
  return Object.entries(values).map(([scope, value]) => {
    const scopeIdHash = scopeHash(scope, value);
    return {
      scope,
      scopeIdHash,
      key: `${scope}:${scopeIdHash}`
    };
  });
}

function windowStart(now, duration) {
  return new Date(Math.floor(now.getTime() / duration) * duration);
}

async function incrementState(scope, direction, bytes, { session = null } = {}) {
  const limits = stateLimit(scope.scope);
  const activeField = direction === "upload" ? "activeUploads" : "activeDownloads";
  const activeLimit = direction === "upload" ? limits.activeUploads : limits.activeDownloads;
  const expressions = [
    {
      $lte: [
        { $add: [{ $ifNull: [`$${activeField}`, 0] }, 1] },
        activeLimit
      ]
    }
  ];
  const increment = { [activeField]: 1 };

  if (direction === "upload") {
    expressions.push({
      $lte: [
        {
          $add: [
            { $ifNull: ["$reservedStorageBytes", 0] },
            { $ifNull: ["$temporaryStorageBytes", 0] },
            { $ifNull: ["$persistentStorageBytes", 0] },
            bytes
          ]
        },
        limits.storageBytes
      ]
    });
    expressions.push({
      $lte: [
        { $add: [{ $ifNull: ["$objectCount", 0] }, 1] },
        limits.objects
      ]
    });
    increment.reservedStorageBytes = bytes;
  }

  try {
    await MediaQuotaState.updateOne(
      { key: scope.key },
      {
        $setOnInsert: {
          key: scope.key,
          scope: scope.scope,
          scopeIdHash: scope.scopeIdHash
        }
      },
      { upsert: true, session }
    );
    const result = await MediaQuotaState.updateOne(
      { key: scope.key, $expr: { $and: expressions } },
      { $inc: increment },
      { session }
    );
    if (!result.matchedCount) throw quotaError();
  } catch (err) {
    if (err?.code === 11000 || err?.code === "MEDIA_QUOTA_EXCEEDED") throw quotaError();
    throw err;
  }
}

async function incrementWindow(scope, direction, window, bytes, now, { session = null } = {}) {
  const duration = WINDOWS[window];
  const startedAt = windowStart(now, duration);
  const key = `${scope.key}:${direction}:${window}:${startedAt.getTime()}`;
  const limit = windowLimit(scope.scope, direction, window);
  try {
    await MediaQuotaBucket.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          scope: scope.scope,
          scopeIdHash: scope.scopeIdHash,
          direction,
          window,
          windowStartedAt: startedAt,
          expiresAt: new Date(startedAt.getTime() + duration * 2)
        }
      },
      { upsert: true, session }
    );
    const result = await MediaQuotaBucket.updateOne(
      {
        key,
        $expr: {
          $and: [
            {
              $lte: [
                { $add: [{ $ifNull: ["$bytes", 0] }, bytes] },
                limit.bytes
              ]
            },
            {
              $lte: [
                { $add: [{ $ifNull: ["$requests", 0] }, 1] },
                limit.requests
              ]
            }
          ]
        }
      },
      { $inc: { bytes, requests: 1 } },
      { session }
    );
    if (!result.matchedCount) throw quotaError();
    return key;
  } catch (err) {
    if (err?.code === 11000 || err?.code === "MEDIA_QUOTA_EXCEEDED") throw quotaError();
    throw err;
  }
}

async function reserveMediaTransfer(req, {
  direction,
  bytes,
  conversationId = "",
  uploadId = ""
}) {
  if (!["upload", "download"].includes(direction) || !Number.isSafeInteger(bytes) || bytes <= 0) {
    const err = new TypeError("invalid media quota reservation");
    err.status = 400;
    throw err;
  }

  const now = new Date();
  const scopes = transferScopes(req);
  return runMongoTransaction(async session => {
    const [reservation] = await MediaTransferReservation.create([{
      reservationId: crypto.randomBytes(24).toString("base64url"),
      direction,
      userId: req.user.userId,
      clientIdHash: scopeHash("client-record", req.cryptoDevice.clientId),
      sessionIdHash: hashSessionId(req.user.sid),
      ipHash: hashRequestIp(req),
      conversationIdHash: conversationId ? scopeHash("conversation", conversationId) : "",
      uploadIdHash: uploadId ? scopeHash("upload", uploadId) : "",
      declaredBytes: bytes,
      scopes,
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS)
    }], { session });
    const bucketKeys = [];
    for (const scope of scopes) {
      await incrementState(scope, direction, bytes, { session });
      for (const window of Object.keys(WINDOWS)) {
        bucketKeys.push(await incrementWindow(scope, direction, window, bytes, now, { session }));
      }
    }
    reservation.state = "reserved";
    reservation.bucketKeys = bucketKeys;
    await reservation.save({ session });
    return {
      reservationId: reservation.reservationId,
      declaredBytes: bytes
    };
  });
}

async function settleReservation(reservationId, {
  completed,
  actualBytes = 0,
  uploadId = ""
}) {
  return runMongoTransaction(async session => {
    const reservation = await MediaTransferReservation.findOne({
      reservationId,
      state: "reserved"
    }).session(session).lean();
    if (!reservation) return false;
    if (completed && actualBytes > reservation.declaredBytes) {
      throw quotaError("encrypted media exceeded its signed byte reservation");
    }

    if (completed && reservation.direction === "upload") {
      const upload = await AttachmentUpload.findOneAndUpdate(
        {
          uploadId,
          protocol: "mls-media-1",
          lifecycleState: "temporary",
          quotaStorageState: "untracked"
        },
        {
          $set: {
            quotaScopes: reservation.scopes,
            quotaBytes: actualBytes,
            quotaStorageState: "temporary"
          }
        },
        { returnDocument: "after", session }
      ).lean();
      if (!upload) {
        const error = new Error("encrypted media quota cannot bind to upload metadata");
        error.code = "MEDIA_QUOTA_UPLOAD_BINDING_FAILED";
        throw error;
      }
    }

    const transition = await MediaTransferReservation.updateOne(
      { _id: reservation._id, state: "reserved" },
      {
        $set: {
          state: completed ? "completed" : "released",
          actualBytes: completed ? actualBytes : 0,
          ...(completed ? { completedAt: new Date() } : { releasedAt: new Date() })
        }
      },
      { session }
    );
    if (transition.modifiedCount !== 1) return false;

    const direction = reservation.direction;
    for (const scope of reservation.scopes) {
      const activeField = direction === "upload" ? "activeUploads" : "activeDownloads";
      const increment = { [activeField]: -1 };
      if (direction === "upload") {
        increment.reservedStorageBytes = -reservation.declaredBytes;
        if (completed) {
          increment.temporaryStorageBytes = actualBytes;
          increment.objectCount = 1;
        }
      }
      await MediaQuotaState.updateOne(
        { key: scope.key },
        { $inc: increment },
        { session }
      );
    }
    return true;
  });
}

async function completeMediaTransfer(reservationId, actualBytes, { uploadId = "" } = {}) {
  if (!Number.isSafeInteger(actualBytes) || actualBytes <= 0) {
    throw new TypeError("invalid completed media byte count");
  }
  return settleReservation(reservationId, { completed: true, actualBytes, uploadId });
}

async function releaseMediaTransfer(reservationId) {
  return settleReservation(reservationId, { completed: false });
}

async function releaseExpiredMediaTransfers(now = new Date()) {
  const expired = await MediaTransferReservation.find({
    state: "reserved",
    expiresAt: { $lte: now }
  }).select("reservationId").limit(1000).lean();
  const settled = await Promise.allSettled(
    expired.map(item => releaseMediaTransfer(item.reservationId))
  );
  return settled.filter(item => item.status === "fulfilled" && item.value).length;
}

function storageIncrement(from, to, bytes) {
  const increment = {};
  if (from === "temporary") increment.temporaryStorageBytes = -bytes;
  if (from === "persistent") increment.persistentStorageBytes = -bytes;
  if (to === "temporary") increment.temporaryStorageBytes = bytes;
  if (to === "persistent") increment.persistentStorageBytes = bytes;
  if (to === "released") increment.objectCount = -1;
  return increment;
}

async function transitionMediaUploadQuota(uploadId, {
  from,
  to,
  session = null
}) {
  const allowedFrom = Array.isArray(from) ? from : [from];
  if (!allowedFrom.every(value => ["temporary", "persistent"].includes(value)) ||
      !["persistent", "released"].includes(to)) {
    throw new TypeError("invalid media quota storage transition");
  }
  const work = async transactionSession => {
    const upload = await AttachmentUpload.findOneAndUpdate(
      {
        uploadId,
        quotaStorageState: { $in: allowedFrom },
        quotaBytes: { $gt: 0 },
        "quotaScopes.0": { $exists: true }
      },
      { $set: { quotaStorageState: to } },
      { returnDocument: "before", session: transactionSession }
    ).lean();
    if (!upload) return false;
    for (const scope of upload.quotaScopes) {
      await MediaQuotaState.updateOne(
        { key: scope.key },
        { $inc: storageIncrement(upload.quotaStorageState, to, upload.quotaBytes) },
        { session: transactionSession }
      );
    }
    return true;
  };
  return session ? work(session) : runMongoTransaction(work);
}

async function promoteMediaUploadQuota(uploadId, options = {}) {
  return transitionMediaUploadQuota(uploadId, {
    from: "temporary",
    to: "persistent",
    session: options.session || null
  });
}

async function releaseMediaUploadQuota(uploadId, options = {}) {
  return transitionMediaUploadQuota(uploadId, {
    from: ["temporary", "persistent"],
    to: "released",
    session: options.session || null
  });
}

async function releaseAndDeleteMediaUpload(uploadId) {
  return runMongoTransaction(async session => {
    await releaseMediaUploadQuota(uploadId, { session });
    return AttachmentUpload.deleteOne({ uploadId }, { session });
  });
}

module.exports = {
  reserveMediaTransfer,
  completeMediaTransfer,
  releaseMediaTransfer,
  releaseExpiredMediaTransfers,
  promoteMediaUploadQuota,
  releaseMediaUploadQuota,
  releaseAndDeleteMediaUpload,
  scopeHash,
  windowLimit,
  stateLimit
};
