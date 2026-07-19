"use strict";

const crypto = require("node:crypto");

function migrationOwner() {
  return crypto.randomBytes(24).toString("base64url");
}

async function acquireLease(collection, migrationId, {
  owner = migrationOwner(),
  version,
  now = new Date(),
  leaseMs = 60_000
} = {}) {
  const existing = await collection.findOne({ _id: migrationId });
  if (existing?.status === "completed") return { completed: true, state: existing, owner };
  if (existing?.nextAttemptAt && new Date(existing.nextAttemptAt) > now) {
    const error = new Error("migration retry is not due");
    error.code = "MIGRATION_RETRY_NOT_DUE";
    throw error;
  }
  const query = {
    _id: migrationId,
    status: { $ne: "completed" },
    $or: [
      { leaseOwner: owner },
      { leaseOwner: "" },
      { leaseOwner: { $exists: false } },
      { leaseExpiresAt: null },
      { leaseExpiresAt: { $lte: now } }
    ]
  };
  try {
    const state = await collection.findOneAndUpdate(query, {
      $setOnInsert: {
        version,
        phase: "indexes",
        cursor: null,
        counters: {},
        attempts: 0,
        startedAt: now
      },
      $set: {
        status: "running",
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        nextAttemptAt: now,
        updatedAt: now
      },
      $inc: { leaseGeneration: 1 }
    }, {
      upsert: !existing,
      returnDocument: "after"
    });
    if (!state) {
      const error = new Error("migration is already running");
      error.code = "MIGRATION_LEASE_BUSY";
      throw error;
    }
    return { completed: false, state, owner };
  } catch (error) {
    if (error?.code === 11000) {
      const busy = new Error("migration is already running");
      busy.code = "MIGRATION_LEASE_BUSY";
      throw busy;
    }
    throw error;
  }
}

async function renewLease(collection, migrationId, owner, {
  now = new Date(),
  leaseMs = 60_000
} = {}) {
  const result = await collection.updateOne(
    { _id: migrationId, status: "running", leaseOwner: owner, leaseExpiresAt: { $gt: now } },
    { $set: { leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now } }
  );
  if (result.matchedCount !== 1) {
    const error = new Error("migration lease lost");
    error.code = "MIGRATION_LEASE_LOST";
    throw error;
  }
}

async function advancePhase(collection, migrationId, owner, phase, now = new Date()) {
  const result = await collection.updateOne(
    { _id: migrationId, status: "running", leaseOwner: owner },
    { $set: { phase, cursor: null, updatedAt: now } }
  );
  if (result.matchedCount !== 1) {
    const error = new Error("migration lease lost while advancing phase");
    error.code = "MIGRATION_LEASE_LOST";
    throw error;
  }
}

async function checkpointBatch(collection, migrationId, owner, {
  cursor,
  counter,
  count,
  now = new Date()
}) {
  const result = await collection.updateOne(
    { _id: migrationId, status: "running", leaseOwner: owner },
    {
      $set: { cursor, updatedAt: now },
      $inc: { [`counters.${counter}`]: count }
    }
  );
  if (result.matchedCount !== 1) {
    const error = new Error("migration lease lost while checkpointing");
    error.code = "MIGRATION_LEASE_LOST";
    throw error;
  }
}

async function pauseOrFail(collection, migrationId, owner, error, now = new Date()) {
  const interrupted = error?.code === "MIGRATION_INTERRUPTED";
  const state = await collection.findOne({ _id: migrationId, leaseOwner: owner });
  const attempts = Number(state?.attempts || 0) + (interrupted ? 0 : 1);
  const delay = interrupted ? 0 : Math.min(6 * 60 * 60 * 1000, 1000 * (2 ** Math.min(12, Math.max(0, attempts - 1))));
  await collection.updateOne(
    { _id: migrationId, status: "running", leaseOwner: owner },
    {
      $set: {
        status: interrupted ? "paused" : "failed",
        leaseOwner: "",
        leaseExpiresAt: null,
        nextAttemptAt: new Date(now.getTime() + delay),
        lastErrorCode: String(error?.code || error?.name || "MIGRATION_FAILED").slice(0, 80),
        updatedAt: now
      },
      ...(!interrupted ? { $inc: { attempts: 1 } } : {})
    }
  );
}

module.exports = {
  acquireLease,
  advancePhase,
  checkpointBatch,
  migrationOwner,
  pauseOrFail,
  renewLease
};
