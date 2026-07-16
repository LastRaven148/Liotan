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
  const users = await User.find({}, "username displayName emailVerified e2eePublicKey avatarStorageKey").lean();
  const now = new Date();
  const inventory = [];

  for (const user of users) {
    inventory.push({
      username: user.username,
      displayName: user.displayName || "",
      emailVerified: Boolean(user.emailVerified),
      hasLegacyPublicKey: Boolean(user.e2eePublicKey),
      hasAvatarObject: Boolean(user.avatarStorageKey),
      sessionsTotal: await Session.countDocuments({ username: user.username }),
      sessionsActive: await Session.countDocuments({ username: user.username, revokedAt: null, expiresAt: { $gt: now } }),
      uploadsTotal: await AttachmentUpload.countDocuments({ owner: user.username }),
      legacyUploads: await AttachmentUpload.countDocuments({ owner: user.username, protocol: "legacy-v3" }),
      mlsUploads: await AttachmentUpload.countDocuments({ owner: user.username, protocol: "mls-media-1" }),
      messages: await Messages.countDocuments({ $or: [{ from: user.username }, { to: user.username }] }),
      legacyKeys: await E2EEKey.countDocuments({ user: user.username }),
      unversionedUploads: await AttachmentUpload.countDocuments({
        owner: user.username,
        $or: [{ protocol: { $exists: false } }, { protocol: "" }, { protocol: null }]
      })
    });
  }

  const uploads = await AttachmentUpload.aggregate([
    { $group: { _id: { protocol: "$protocol", encrypted: "$encrypted" }, count: { $sum: 1 } } }
  ]);

  console.log(JSON.stringify({
    schemaVersion: 1,
    users: inventory,
    legacy: {
      e2eeConversations: await E2EEConversation.countDocuments({}),
      e2eeKeys: await E2EEKey.countDocuments({})
    },
    mls: {
      identities: await CryptoIdentity.countDocuments({}),
      devices: await CryptoDevice.countDocuments({}),
      conversations: await CryptoConversation.countDocuments({}),
      events: await CryptoEvent.countDocuments({}),
      directoryEntries: await CryptoDirectoryEntry.countDocuments({})
    },
    messages: await Messages.countDocuments({}),
    uploads
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(error => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
