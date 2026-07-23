"use strict";

const AttachmentUpload = require("../models/AttachmentUpload");
const MediaQuotaState = require("../models/MediaQuotaState");
const MediaTransferReservation = require("../models/MediaTransferReservation");

const COUNTER_FIELDS = [
  "activeUploads",
  "activeDownloads",
  "reservedStorageBytes",
  "temporaryStorageBytes",
  "persistentStorageBytes",
  "objectCount"
];

function emptyExpected(scope) {
  return {
    scope: scope.scope,
    scopeIdHash: scope.scopeIdHash,
    activeUploads: 0,
    activeDownloads: 0,
    reservedStorageBytes: 0,
    temporaryStorageBytes: 0,
    persistentStorageBytes: 0,
    objectCount: 0
  };
}

function expectedFor(map, scope) {
  if (!map.has(scope.key)) map.set(scope.key, emptyExpected(scope));
  return map.get(scope.key);
}

async function collectExpected() {
  const expected = new Map();
  const reservations = MediaTransferReservation.find({
    state: "reserved"
  }, "direction declaredBytes scopes").lean().cursor();
  for await (const reservation of reservations) {
    for (const scope of reservation.scopes || []) {
      const value = expectedFor(expected, scope);
      if (reservation.direction === "upload") {
        value.activeUploads += 1;
        value.reservedStorageBytes += Number(reservation.declaredBytes) || 0;
      } else {
        value.activeDownloads += 1;
      }
    }
  }

  const uploads = AttachmentUpload.find({
    quotaStorageState: { $in: ["temporary", "persistent"] },
    quotaBytes: { $gt: 0 },
    "quotaScopes.0": { $exists: true }
  }, "quotaStorageState quotaBytes quotaScopes").lean().cursor();
  for await (const upload of uploads) {
    for (const scope of upload.quotaScopes || []) {
      const value = expectedFor(expected, scope);
      const bytes = Number(upload.quotaBytes) || 0;
      if (upload.quotaStorageState === "temporary") value.temporaryStorageBytes += bytes;
      else value.persistentStorageBytes += bytes;
      value.objectCount += 1;
    }
  }
  return expected;
}

function differs(actual, expected) {
  return COUNTER_FIELDS.some(field =>
    Number(actual?.[field] || 0) !== Number(expected?.[field] || 0)
  );
}

async function reconcileMediaQuota({ apply = false, batchSize = 250 } = {}) {
  batchSize = Math.max(1, Math.min(Number(batchSize) || 250, 1000));
  const expected = await collectExpected();
  const existing = new Map();
  const cursor = MediaQuotaState.find({}, [
    "key",
    "scope",
    "scopeIdHash",
    ...COUNTER_FIELDS
  ].join(" ")).lean().cursor();
  for await (const state of cursor) existing.set(state.key, state);
  const keys = new Set([...expected.keys(), ...existing.keys()]);
  let discrepancies = 0;
  const operations = [];
  const now = new Date();

  for (const key of keys) {
    const actual = existing.get(key);
    const wanted = expected.get(key) || emptyExpected(actual);
    if (!differs(actual, wanted)) continue;
    discrepancies += 1;
    if (!apply) continue;
    operations.push({
      updateOne: {
        filter: { key },
        update: {
          $set: {
            key,
            scope: wanted.scope,
            scopeIdHash: wanted.scopeIdHash,
            ...Object.fromEntries(COUNTER_FIELDS.map(field => [field, wanted[field]])),
            reconciledAt: now
          }
        },
        upsert: true
      }
    });
    if (operations.length >= batchSize) {
      await MediaQuotaState.bulkWrite(operations, { ordered: true });
      operations.length = 0;
    }
  }
  if (operations.length) await MediaQuotaState.bulkWrite(operations, { ordered: true });

  return {
    expectedKeys: expected.size,
    existingKeys: existing.size,
    discrepancies,
    corrected: apply ? discrepancies : 0
  };
}

module.exports = {
  COUNTER_FIELDS,
  collectExpected,
  reconcileMediaQuota
};
