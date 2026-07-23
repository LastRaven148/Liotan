"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");

const serverRoot = process.cwd();
const requireFromServer = createRequire(path.join(serverRoot, "package.json"));

function assertReadOnlyInvocation() {
  const production = process.env.NODE_ENV === "production";
  const explicitlyConfirmed = process.argv.includes("--production-read-only");
  if (production && !explicitlyConfirmed) {
    throw new Error(
      "Production inventory requires the explicit --production-read-only flag"
    );
  }
}

function safeError(error) {
  return {
    name: String(error?.name || "Error").slice(0, 80),
    code: String(error?.code || "INVENTORY_FAILED").slice(0, 80)
  };
}

async function run() {
  assertReadOnlyInvocation();
  requireFromServer("dotenv").config({ path: path.join(serverRoot, ".env") });
  const mongoose = requireFromServer("mongoose");
  await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 10_000
  });

  const model = name => require(path.join(serverRoot, "models", name));
  const User = model("User");
  const Session = model("Session");
  const AttachmentUpload = model("AttachmentUpload");
  const E2EEKey = model("E2EEKey");
  const E2EEConversation = model("E2EEConversation");
  const Messages = model("Messages");
  const CryptoIdentity = model("CryptoIdentity");
  const CryptoDevice = model("CryptoDevice");
  const CryptoConversation = model("CryptoConversation");
  const CryptoEvent = model("CryptoEvent");
  const CryptoDirectoryEntry = model("CryptoDirectoryEntry");
  const UserBlock = model("UserBlock");
  const UserNotificationSettings = model("UserNotificationSettings");
  const MessageVisibility = model("MessageVisibility");
  const ClientInvalidation = model("ClientInvalidation");
  const DeletionWorkflow = model("DeletionWorkflow");
  const DeletionObjectTask = model("DeletionObjectTask");
  const AvatarObject = model("AvatarObject");
  const AvatarUploadLease = model("AvatarUploadLease");
  const MediaQuotaBucket = model("MediaQuotaBucket");
  const MediaQuotaState = model("MediaQuotaState");
  const MediaTransferReservation = model("MediaTransferReservation");
  const LegacyRetirementObjectTask = model("LegacyRetirementObjectTask");
  const CryptoTransparencyLeaf = model("CryptoTransparencyLeaf");
  const CryptoTransparencyCheckpoint = model("CryptoTransparencyCheckpoint");
  const now = new Date();

  const uploads = await AttachmentUpload.aggregate([
    { $group: { _id: { protocol: "$protocol", encrypted: "$encrypted" }, count: { $sum: 1 } } }
  ]);

  console.log(JSON.stringify({
    schemaVersion: 2,
    privacy: {
      outputMode: "aggregate-counts-only",
      containsUserReferences: false
    },
    accounts: {
      total: await User.countDocuments({}),
      emailVerified: await User.countDocuments({ emailVerified: true }),
      withLegacyPublicKey: await User.countDocuments({ e2eePublicKey: { $ne: null } }),
      withAvatarObject: await User.countDocuments({ avatarStorageKey: { $type: "string", $ne: "" } })
    },
    sessions: {
      total: await Session.countDocuments({}),
      active: await Session.countDocuments({ revokedAt: null, expiresAt: { $gt: now } })
    },
    legacy: {
      e2eeConversations: await E2EEConversation.countDocuments({}),
      e2eeKeys: await E2EEKey.countDocuments({}),
      messages: await Messages.countDocuments({}),
      plaintextMessages: await Messages.countDocuments({ contentMode: { $ne: "e2ee" } }),
      legacyUploads: await AttachmentUpload.countDocuments({
        protocol: { $ne: "mls-media-1" }
      }),
      unversionedUploads: await AttachmentUpload.countDocuments({
        $or: [{ protocol: { $exists: false } }, { protocol: "" }, { protocol: null }]
      })
    },
    mls: {
      identities: await CryptoIdentity.countDocuments({}),
      devices: await CryptoDevice.countDocuments({}),
      conversations: await CryptoConversation.countDocuments({}),
      events: await CryptoEvent.countDocuments({}),
      directoryEntries: await CryptoDirectoryEntry.countDocuments({})
    },
    uploads,
    application: {
      blockEdges: await UserBlock.countDocuments({}),
      notificationSettings: await UserNotificationSettings.countDocuments({}),
      messageVisibility: await MessageVisibility.countDocuments({}),
      pendingInvalidations: await ClientInvalidation.countDocuments({ acknowledgedAt: null })
    },
    deletion: {
      activeWorkflows: await DeletionWorkflow.countDocuments({ terminal: false }),
      deadLetterWorkflows: await DeletionWorkflow.countDocuments({ state: "dead-letter" }),
      pendingObjectTasks: await DeletionObjectTask.countDocuments({ state: "pending" }),
      deadLetterObjectTasks: await DeletionObjectTask.countDocuments({ state: "dead-letter" })
    },
    storageLifecycle: {
      avatarObjects: await AvatarObject.countDocuments({}),
      activeAvatarLeases: await AvatarUploadLease.countDocuments({ expiresAt: { $gt: now } }),
      mediaQuotaBuckets: await MediaQuotaBucket.countDocuments({}),
      mediaQuotaStates: await MediaQuotaState.countDocuments({}),
      activeTransferReservations: await MediaTransferReservation.countDocuments({
        state: "active",
        expiresAt: { $gt: now }
      }),
      pendingLegacyObjectTasks: await LegacyRetirementObjectTask.countDocuments({
        state: "pending"
      }),
      deadLetterLegacyObjectTasks: await LegacyRetirementObjectTask.countDocuments({
        state: "dead-letter"
      })
    },
    transparency: {
      leaves: await CryptoTransparencyLeaf.countDocuments({}),
      checkpoints: await CryptoTransparencyCheckpoint.countDocuments({})
    }
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(error => {
  console.error(JSON.stringify({ error: safeError(error) }));
  process.exitCode = 1;
});
