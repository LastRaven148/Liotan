"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");

const serverRoot = process.cwd();
const requireFromServer = createRequire(path.join(serverRoot, "package.json"));

async function run() {
  requireFromServer("dotenv").config({ path: path.join(serverRoot, ".env") });
  const mongoose = requireFromServer("mongoose");
  await mongoose.connect(process.env.MONGO_URI);

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
    }
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(error => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
