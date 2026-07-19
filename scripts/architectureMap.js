"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const flows = Object.freeze({
  accountDeletion: [
    "server/routes/profileRoutes.js#/me/account",
    "server/controllers/profileController.js#deleteAccount",
    "server/services/deletionWorkflow.js#requestAccountDeletion",
    "server/models/DeletionWorkflow.js#deletionWorkflowSchema",
    "server/models/DeletionObjectTask.js#deletionObjectTaskSchema",
    "server/startup/scheduleDeletionWorkflows.js#scheduleDeletionWorkflows"
  ],
  conversationDeletion: [
    "server/routes/cryptoV4Routes.js#/deletion",
    "server/controllers/cryptoV4/deletion.js#deleteConversation",
    "server/services/deletionWorkflow.js#requestConversationDeletion",
    "server/models/ClientInvalidation.js#conversation-deleted"
  ],
  mlsConversation: [
    "server/routes/cryptoV4Routes.js#/crypto/v4/conversations",
    "server/middleware/cryptoDeviceAuth.js#cryptoDeviceAuth",
    "server/controllers/cryptoV4/conversations.js#resolveConversation",
    "server/controllers/cryptoV4/conversations.js#sendCiphertext",
    "server/controllers/cryptoV4/conversations.js#getEvents"
  ],
  mlsMedia: [
    "server/controllers/cryptoV4/media.js#uploadMedia",
    "server/models/AttachmentUpload.js#lifecycleState",
    "server/scripts/cleanupUploadsTask.js#cleanupR2OrphanUploads",
    "server/startup/scheduleAttachmentCleanup.js#scheduleAttachmentCleanup"
  ],
  messageDeletion: [
    "client/src/hooks/useChat.jsx#sendControl",
    "client/src/crypto/mlsEngine.jsx#sendControl",
    "server/controllers/cryptoV4/conversations.js#sendCiphertext",
    "client/src/crypto/mls/envelope.jsx#dispatchCryptoMessage"
  ],
  clientInvalidation: [
    "client/src/hooks/useSocket.jsx#handleChatDeleted",
    "client/src/hooks/useSocket.jsx#handleUserDeleted",
    "server/controllers/cryptoV4/deletion.js#listInvalidations",
    "client/src/crypto/recoveryStore.jsx#history",
    "client/src/crypto/mls/databaseStorage.jsx#deleteCoreCryptoDatabase",
    "client/src/components/chat/message/messageStorage.jsx#deleteOfflineBlobs"
  ],
  notifications: [
    "client/src/components/settings/pages/NotificationsPage.jsx#localStorage",
    "client/src/utils/notificationSound.jsx#notificationsEnabledForChat",
    "client/src/hooks/useSocket.jsx#notifyIncomingMessage"
  ],
  devices: [
    "server/controllers/cryptoV4/identityDevices.js#listDevices",
    "client/src/crypto/mls/identity.jsx#listCryptoDevices",
    "client/src/components/settings/pages/DevicesPage.jsx#loadCryptoDevices"
  ],
  blocklist: [
    "client/src/components/settings/pages/PrivacyPage.jsx#privacyControlsUnavailable"
  ],
  css: [
    "client/src/App.css#@import",
    "client/src/styles/tokens.css#:root",
    "client/src/styles/mobile.css#@media",
    "client/src/styles/platform-ios.css#-webkit",
    "client/src/styles/accessibility.css#prefers-reduced-motion"
  ]
});

function inspectReference(reference) {
  const separator = reference.indexOf("#");
  const relativeFile = separator === -1 ? reference : reference.slice(0, separator);
  const marker = separator === -1 ? "" : reference.slice(separator + 1);
  const absoluteFile = path.join(root, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    return { reference, ok: false, reason: "file-missing" };
  }
  const source = fs.readFileSync(absoluteFile, "utf8");
  if (marker && !source.includes(marker)) {
    return { reference, ok: false, reason: "marker-missing" };
  }
  return { reference, ok: true };
}

function run() {
  const checks = Object.fromEntries(Object.entries(flows).map(([name, references]) => [
    name,
    references.map(inspectReference)
  ]));
  const failures = Object.values(checks).flat().filter(check => !check.ok);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    repositoryRoot: root,
    flows,
    checks,
    ok: failures.length === 0
  }, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

if (require.main === module) run();

module.exports = { flows, inspectReference, run };
