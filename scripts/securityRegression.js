const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const getChatId = require("../server/utils/getChatId");
const { canonicalJson } = require("../server/utils/canonicalJson");
const { verifyEd25519 } = require("../server/security/cryptoV4");
const crypto = require("crypto");

const rootPackage = JSON.parse(read("package.json"));
const ciWorkflow = read(".github/workflows/ci.yml");
const playwrightVersion = rootPackage.devDependencies?.["@playwright/test"];
assert.match(playwrightVersion || "", /^\d+\.\d+\.\d+$/,
  "Playwright must be pinned to an exact version");
assert.match(
  ciWorkflow,
  new RegExp(`mcr\\.microsoft\\.com/playwright:v${playwrightVersion}-noble@sha256:[a-f0-9]{64}`),
  "CI browser image must be immutable and exactly match the project Playwright version"
);
assert.match(ciWorkflow, /options:\s*--ipc=host/,
  "the Playwright job container must use the recommended shared IPC namespace");
assert.match(ciWorkflow, /name:\s*Verify pinned browser runtime[\s\S]*?HOME:\s*\/root[\s\S]*?browserType\.launch/,
  "CI must launch every pinned browser with a home directory owned by the container user");
assert.match(ciWorkflow, /name:\s*Run complete release gate\s+env:\s+HOME:\s*\/root/,
  "the release gate must preserve the Firefox-compatible container home directory");
assert.doesNotMatch(ciWorkflow, /playwright\s+install(?:-deps)?|playwright\s+install\s+--with-deps/,
  "CI must not install browser OS dependencies dynamically from an Ubuntu mirror");
const releaseCheck = read("scripts/checkRelease.js");
assert.match(releaseCheck, /require\("yauzl"\)/,
  "release ZIP validation must use a locked cross-platform implementation");
assert.doesNotMatch(releaseCheck, /execFileSync\("(?:unzip|bsdtar|tar)"/,
  "release validation must not depend on runner-specific ZIP commands");

const first = getChatId("abc", "def_ghi");
const second = getChatId("abc_def", "ghi");
assert.notStrictEqual(first, second, "private conversation IDs must be collision-free");
assert.deepStrictEqual(getChatId.getPrivateChatParticipants(first), ["abc", "def_ghi"]);

const getPrivateChat = read("server/sockets/handlers/private/getPrivateChat.js");
assert.doesNotMatch(getPrivateChat, /models\/Messages|chatHistory|serializeMessages/,
  "v4-only private sockets must not read or emit legacy message history");
const getGroupChat = read("server/sockets/handlers/group/getGroupChat.js");
assert.doesNotMatch(getGroupChat, /models\/Messages|chatHistory|serializeMessages/,
  "v4-only group sockets must not read or emit legacy message history");
assert(!fs.existsSync(path.join(root, "client/src/crypto/legacy/e2eeV3ReadOnly.jsx")),
  "the executable v3 crypto client must be removed after the v4 cutover");
const e2eeFacade = read("client/src/utils/e2ee.jsx");
assert.match(e2eeFacade, /MLS v4-only UI facade/);
assert.doesNotMatch(e2eeFacade, /PBKDF2|deriveMessageKey|ensureConversationSecret|legacy\/e2ee/,
  "the v4 UI facade must not contain legacy key derivation or delivery");

const clientApi = read("client/src/services/api.jsx");
assert.doesNotMatch(clientApi, /\/e2ee\/(identity(?:-backup)?|conversations\/[^`"']+\/key)/,
  "client must not contain legacy E2EE identity/private-key delivery calls");
const currentCryptoClient = [
  "client/src/crypto/cryptoApi.jsx",
  "client/src/crypto/mlsEngine.jsx",
  "client/src/crypto/mls/identity.jsx",
  "client/src/crypto/mls/media.jsx"
].map(read).join("\n");
assert.match(currentCryptoClient, /\/crypto\/v4\//, "client must use the MLS v4 API");
const legacyRoutes = read("server/routes/e2eeRoutes.js");
for (const endpoint of [
  "/e2ee/identity",
  "/e2ee/identity-backup",
  "/e2ee/identity/:username",
  "/e2ee/identities",
  "/e2ee/devices/:username",
  "/e2ee/conversations/:conversationId/key"
]) {
  const route = legacyRoutes.slice(legacyRoutes.indexOf(`\"${endpoint}\"`));
  assert(route.indexOf("legacyWriteGone") >= 0 && route.indexOf("legacyWriteGone") < route.indexOf(");"),
    `${endpoint} must remain permanently gone`);
}

assert.strictEqual(
  canonicalJson({ z: [3, { b: true, a: "x" }], a: 1 }),
  '{"a":1,"z":[3,{"a":"x","b":true}]}',
  "crypto request canonicalization must be deterministic"
);
const signingKey = crypto.generateKeyPairSync("ed25519");
const rawPublicKey = signingKey.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");
const signedValue = { method: "POST", path: "/crypto/v4/test", timestamp: 123, nonce: "n", bodyHash: "h" };
const signature = crypto.sign(
  null,
  Buffer.from(canonicalJson(["liotan-crypto-request-v1", signedValue])),
  signingKey.privateKey
).toString("base64url");
assert(verifyEd25519({
  publicKey: rawPublicKey,
  signature,
  domain: "liotan-crypto-request-v1",
  value: signedValue
}), "device request signatures must verify");
assert(!verifyEd25519({
  publicKey: rawPublicKey,
  signature,
  domain: "liotan-crypto-request-v1",
  value: { ...signedValue, path: "/crypto/v4/tampered" }
}), "request path tampering must invalidate the signature");

const recentAuth = read("server/middleware/recentAuth.js");
assert.match(recentAuth, /select\("reauthenticatedAt"\)/);
assert.doesNotMatch(recentAuth, /select\("createdAt lastSeenAt"\)/);
assert.match(read("server/routes/profileRoutes.js"), /requireReauthentication,\s*deleteAccount/);

const socket = read("server/sockets/socket.js");
assert.match(socket, /socket\.use\(async/);
assert.match(socket, /SOCKET_AUTH_RECHECK_MS/);
assert.match(read("server/utils/sessionSecurity.js"), /disconnectSessionHashes/);

const attachment = read("server/controllers/attachmentController.js");
assert.match(attachment, /encrypted attachment required/);
assert.match(read("server/services/attachmentOwnership.js"), /encrypted: true/);
const cryptoRoutes = read("server/routes/cryptoV4Routes.js");
assert.match(cryptoRoutes, /cryptoDeviceAuth/);
const mediaRoute = cryptoRoutes.slice(cryptoRoutes.indexOf('"\/crypto\/v4\/media\/upload"'));
assert(mediaRoute.indexOf("cryptoDeviceAuth") < mediaRoute.indexOf("attachmentUpload.single"),
  "device authentication must happen before multipart data reaches temporary storage");
assert.match(read("server/middleware/cryptoDeviceAuth.js"), /x-liotan-crypto-body/);
assert.match(read("server/middleware/cryptoDeviceAuth.js"), /signed crypto body required for multipart request/,
  "multipart MLS uploads must require canonical metadata authenticated before Multer");
assert.match(read("server/config/attachmentUpload.js"), /ciphertextFramingValidator/);
assert.match(read("server/config/attachmentUpload.js"), /LIOTANMLS1/);
assert.match(read("server/config/attachmentUpload.js"), /fields:\s*0/,
  "multipart MLS uploads must reject duplicate attacker-controlled metadata fields");
assert.doesNotMatch(read("client/src/crypto/mls/media.jsx"), /Object\.entries\(signingBody\).*formData/s,
  "private media metadata must have only one signed wire representation");
const cryptoControllers = ["shared.js", "identityDevices.js", "conversations.js", "media.js"]
  .map(name => read(`server/controllers/cryptoV4/${name}`)).join("\n");
assert.match(cryptoControllers, /MLS ciphertext media required/);
assert.match(cryptoControllers, /unexpected MLS epoch/);
assert.match(cryptoControllers, /manifestExpiresAt/);
assert.match(read("server/models/CryptoRequestNonce.js"), /unique: true/);
const mlsClient = ["mlsEngine.jsx", "mls/constants.jsx", "mls/envelope.jsx", "mls/trust.jsx", "mls/identifiers.jsx"]
  .map(name => read(`client/src/crypto/${name}`)).join("\n");
assert.match(mlsClient, /Mls128Dhkemx25519Aes128gcmSha256Ed25519/);
assert.match(mlsClient, /Safety number changed/);
assert.match(mlsClient, /assertEnvelopeSchema/);
assert.match(mlsClient, /initializeCoreCryptoRuntime/);
assert.match(mlsClient, /MEDIA_CHUNK_SIZES/,
  "MLS envelope validation must share the authenticated adaptive media chunk contract");
assert.doesNotMatch(read("client/src/crypto/mlsEngine.jsx"), /initWasmModule/);
assert.match(read("client/src/crypto/coreCryptoRuntime.jsx"), /runtimePromise/);
const mlsEngineSource = read("client/src/crypto/mlsEngine.jsx");
const engineConstructor = mlsEngineSource.slice(
  mlsEngineSource.indexOf("constructor({ username"),
  mlsEngineSource.indexOf("async initialize()")
);
assert.doesNotMatch(engineConstructor, /new (?:ClientId|Uuid)|DeviceId\.fromHexString/,
  "LiotanMlsEngine constructor must not touch UniFFI before WASM initialization");
const identifierSource = read("client/src/crypto/mls/identifiers.jsx");
assert(identifierSource.indexOf("await initializeCoreCryptoRuntime()") < identifierSource.indexOf("const clientId = createClientId"),
  "application ClientId creation must follow awaited WASM initialization");
const recoveryStore = read("client/src/crypto/recoveryStore.jsx");
assert.match(recoveryStore, /wrappingKeyPromises/);
assert.match(recoveryStore, /idbAdd\("keys"/);
assert.doesNotMatch(recoveryStore, /localStorage/,
  "recovery material must never use localStorage");
assert.match(recoveryStore, /RECOVERY_PBKDF2_ITERATIONS\s*=\s*600000/,
  "local recovery passphrases must use the documented PBKDF2 compatibility floor");
assert.match(recoveryStore, /recovery-user-presence-required/,
  "passphrase-protected recovery records must fail closed without user presence");
assert.match(recoveryStore, /recovery-migration:/,
  "recovery protection changes must use a resumable staged record");
assert.match(recoveryStore, /recoveryUnlockPromises/,
  "concurrent recovery unlock must remain single-flight");
assert.match(read("client/src/crypto/mlsEngine.jsx"), /latestBootstrap\.device/);
assert.match(read("client/src/crypto/mlsEngine.jsx"), /reprovisionMlsDevice/);
assert.match(read("client/src/crypto/mlsEngine.jsx"), /isStorageStage/,
  "non-storage startup failures must not trigger IndexedDB repair or reprovision guidance");
assert.match(read("client/src/crypto/mlsEngine.jsx"), /configureCryptoSigner\(null\);\s*wipeEngineKeys\(keys\)/,
  "failed initialization must clear the device request signer before wiping key bytes");
assert.doesNotMatch(read("client/src/crypto/CryptoGate.jsx"), /window\.location\.reload/);
const transitionGate = read("client/src/crypto/SecureTransitionGate.jsx");
for (const status of ["checking-session", "opening-storage", "preparing-messages", "closing-session"]) {
  assert.match(transitionGate, new RegExp(status));
}
const useChat = read("client/src/hooks/useChat.jsx");
assert.match(useChat, /getMlsEngine\(\)\.sendMessage/);
assert.doesNotMatch(useChat, /socketRef\.current\.emit\([^\n]*(SEND_MESSAGE|sendMessage)/i,
  "message send must never fall back to plaintext Socket.IO");
assert.doesNotMatch(useChat, /SOCKET_EVENTS\.(?:GET_CHAT|GET_GROUP_CHAT|DELETE_CHAT)/,
  "v4-only chat flow must not request, mutate, or delete legacy history");
const useSocket = read("client/src/hooks/useSocket.jsx");
for (const event of ["NEW_MESSAGE", "CHAT_HISTORY", "MESSAGE_EDITED", "MESSAGE_DELETED", "MESSAGE_PINNED"]) {
  assert.doesNotMatch(useSocket, new RegExp(`currentSocket\\.on\\(SOCKET_EVENTS\\.${event}`),
    `legacy ${event} payloads must not enter the trusted client state`);
}
assert.doesNotMatch(read("server/controllers/dialogController.js"), /models\/Messages|encryptedContent|lastMessageAttachment:\s*attachment/,
  "dialog discovery must use MLS conversation metadata, never legacy message content");
assert.match(useChat, /status:\s*"sending"/,
  "outgoing messages must enter an explicit pending state before MLS delivery completes");
assert.match(read("client/src/utils/chatState.jsx"), /MAX_CHAT_WINDOW_MESSAGES\s*=\s*240/,
  "rendered chat history must remain bounded independently of encrypted local history");
assert.match(read("client/src/crypto/recoveryStore.jsx"), /byConversationSequence/,
  "encrypted local history must expose a compound conversation cursor index");
assert.match(read("client/src/crypto/recoveryStore.jsx"), /putEncryptedHistoryRecords/,
  "legacy encrypted history migration must use bounded IndexedDB batches");
assert.match(read("client/src/crypto/recoveryStore.jsx"), /migrateEncryptedHistoryRecords/,
  "legacy encrypted history must use a resumable paged migration");
assert.match(read("client/src/crypto/recoveryStore.jsx"), /idbDeletePrefix\("records", legacyPrefix\)/,
  "legacy encrypted history must be removed only after a completed migration");
const mlsHistoryEngineSource = read("client/src/crypto/mlsEngine.jsx");
assert.doesNotMatch(mlsHistoryEngineSource, /putEncryptedRecord\(\s*`message:/,
  "new messages must not keep dual-writing the legacy history cache");
assert.match(mlsHistoryEngineSource, /loadedHistory\.add\(state\.conversationId\);\s*this\.startHistoryMigration\(state\);/,
  "legacy history migration must run after the initial indexed page without blocking chat startup");
assert.match(mlsHistoryEngineSource, /sync-checkpoint:/,
  "MLS event progress must have an encrypted per-device checkpoint");
assert.match(mlsHistoryEngineSource, /localStorage is deliberately treated as an[\s\S]*untrusted display hint/,
  "localStorage must never be the cryptographic cursor source of truth");
assert.doesNotMatch(mlsHistoryEngineSource, /handleApplicationMessage\(state, event, buffered\)/,
  "buffered plaintext must never inherit metadata from the commit event");
assert.match(mlsHistoryEngineSource, /mls-buffered-metadata-unavailable/,
  "buffered plaintext without its immutable server event context must fail closed");
assert.match(read("server/controllers/cryptoV4/conversations.js"), /recipientHead/,
  "event reconciliation must expose the authoritative per-recipient head");
assert.match(read("client/src/crypto/mlsEngine.jsx"), /state\?\.ready \|\| !state\.initialized/,
  "the E2EE notice must require a fully ready MLS conversation");
assert.match(read("client/src/crypto/mlsEngine.jsx"), /BACKGROUND_MAINTENANCE_INTERVAL_MS/,
  "inactive conversations must participate in bounded background MLS maintenance");
assert.match(read("client/src/crypto/mls\/constants.jsx"), /VITE_MLS_SELF_UPDATE_HOURS \|\| 72/,
  "the MLS self-update policy must be explicit and configurable within a safe bound");
const directoryServer = read("server/security/cryptoDirectoryState.js");
assert.match(directoryServer, /liotan-device-directory-v1/);
assert.match(directoryServer, /previousHash/);
assert.match(directoryServer, /verifyEd25519/,
  "directory generation advances must be account-root signed");
assert.match(read("server/models/CryptoDirectoryEntry.js"), /version: 1 \}, \{ unique: true \}/,
  "signed directory versions must be append-only and unique per account");
assert.match(read("server/models/CryptoDevice.js"), /\["pending", "active", "expired", "revoked"\]/,
  "new cryptographic devices must have a server-enforced pending state");
const cryptoIdentityController = read("server/controllers/cryptoV4/identityDevices.js");
assert.match(cryptoIdentityController, /liotan-device-approval-v1/);
assert.match(cryptoIdentityController, /a pending device cannot approve itself/);
assert.match(cryptoIdentityController, /the only active crypto device requires an explicit recovery flow/);
assert.match(read("client/src/crypto/mls/trust.jsx"), /Device directory rollback detected/,
  "highest-seen device directory state must fail closed on rollback");
assert.match(read("client/src/crypto/mls/directory.jsx"), /history does not continue the local pin/,
  "a bounded signed-directory tail must continue the encrypted local pin exactly");
assert.doesNotMatch(read("server/controllers/cryptoV4/shared.js"), /CryptoDirectoryEntry\.find[\s\S]{0,180}\.limit\(2000\)/,
  "multi-user directory reads must not truncate an aggregate prefix across accounts");
assert.match(read("server/controllers/cryptoV4/shared.js"), /DIRECTORY_LOG_WINDOW\s*=\s*1024[\s\S]*directoryWindows/,
  "conversation directory responses must select a bounded latest window per account");
assert.match(read("client/src/crypto/mls/media.jsx"), /navigator\.storage\?\.getDirectory/,
  "large media encryption should use OPFS when available instead of retaining every chunk in memory");
const cryptoMigration = read("server/scripts/migrateCryptoState.js");
assert.match(cryptoMigration, /APPLY_50_1_0_CRYPTO_STATE_MIGRATION/);
assert.match(cryptoMigration, /legacy-unverified/);
assert.match(cryptoMigration, /dropIndex/,
  "the historical attachment TTL index must be removed before the new lifecycle is active");
for (const durableModel of [
  "ClientInvalidation",
  "DeletionObjectTask",
  "DeletionWorkflow",
  "MessageVisibility",
  "UserBlock",
  "UserNotificationSettings"
]) {
  assert.match(cryptoMigration, new RegExp(`${durableModel}\\.createIndexes\\(\\)`),
    `migration reconciliation must explicitly create ${durableModel} indexes`);
}
assert.match(read("server/deploy/install-release.sh"), /migrateCryptoState\.js --apply[\s\S]*switch_current/,
  "the idempotent crypto migration must finish before current is switched");
const productionDeployWorkflow = read(".github/workflows/deploy-vps.yml");
assert.match(productionDeployWorkflow, /workflow_dispatch:/,
  "production deployment must require an explicit manual dispatch");
assert.doesNotMatch(productionDeployWorkflow, /workflow_run:/,
  "merging a green main build must not automatically deploy production");
assert.match(productionDeployWorkflow, /branch=main&status=success[\s\S]*release-evidence-/,
  "manual production deployment must remain bound to successful main CI evidence");
const clientSources = fs.readdirSync(path.join(root, "client", "src"), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(?:js|jsx|html)$/.test(entry.name))
  .map(entry => read(path.relative(root, path.join(entry.parentPath, entry.name))))
  .join("\n");
assert.doesNotMatch(clientSources, /static\.cloudflareinsights\.com|beacon\.min\.js/,
  "Cloudflare Insights beacon must not be injected by source code");
const privacyAudit = read("server/scripts/privacyAudit.js");
assert.doesNotMatch(privacyAudit, /privateKey\|chatKey/,
  "privacy audit must not confuse a non-secret chat route with private key material");
assert.match(privacyAudit, /recoveryKey\|databaseKey\|cacheKey/,
  "privacy audit must continue rejecting real E2EE secrets in localStorage values");
assert.match(privacyAudit, /include:\s*\/\^server\\\/\(\?:controllers\|middleware\|routes\)/,
  "storage locator audit must inspect every server input boundary");
assert.match(privacyAudit, /req\\\.\(\?:body\|query\|params\)/,
  "storage locator audit must detect request-derived provider identifiers");
assert.match(privacyAudit, /id:\s*"client-storage-internal-id"[\s\S]*?include:\s*\/\^client\\\/src/,
  "storage locator audit must independently reject provider identifiers in client source");
assert.doesNotMatch(clientSources, /\bstyle\s*=|\.style\./,
  "strict client CSP forbids inline style attributes and CSSOM style mutations");
assert.match(read("server/middleware/contentSecurityPolicy.js"), /styleSrcAttr:\s*\["'none'"\]/);
assert.doesNotMatch(read("server/controllers/auth/securityPages.js"), /<style\b|\sstyle=/i,
  "security email action pages must load a same-origin stylesheet under CSP");
assert.match(read("server/sockets/handlers/private/index.js"), /mls-v4-required/);
assert(!fs.existsSync(path.join(root, "server/sockets/handlers/private/sendPrivateMessage.js")),
  "dead duplicate legacy private write handler must stay removed");
assert(!fs.existsSync(path.join(root, "server/sockets/handlers/group/sendGroupMessage.js")),
  "dead duplicate legacy group write handler must stay removed");

assert.match(read("server/config/version.js"), /require\("\.\.\/package\.json"\)/,
  "runtime version must be sourced from server/package.json");
assert.match(read("server/routes/healthRoutes.js"), /service: "liotan-api",\s*version/,
  "health endpoint must expose the actual package version");

const accountCleanup = read("server/scripts/cleanupDeletedAccounts.js");
assert.match(accountCleanup, /deleteAccountData\(username\)/,
  "administrative account cleanup must use the canonical MLS, session and R2 erasure path");
assert.match(accountCleanup, /LIOTAN_CLEANUP_CONFIRM/,
  "administrative account cleanup must remain a dry-run without explicit confirmation");
assert.doesNotMatch(accountCleanup, /Message\.deleteMany|E2EEKey\.deleteMany|aliveEmailHashes/,
  "administrative cleanup must not maintain a second incomplete or broad deletion implementation");

const accountDeletion = read("server/utils/deleteAccountData.js");
assert.match(accountDeletion, /requestAccountDeletion/,
  "administrative account deletion must delegate to the durable workflow");
assert.doesNotMatch(accountDeletion, /\.deleteMany\(|\.deleteOne\(/,
  "the compatibility adapter must not become a second deletion implementation");
const deletionWorkflow = read("server/services/deletionWorkflow.js");
for (const requiredErasure of [
  "PendingEmailChange.deleteMany",
  "UserNotificationSettings.deleteMany",
  "UserBlock.deleteMany",
  "CryptoDevice.deleteMany",
  "CryptoIdentity.deleteMany",
  "CryptoKeyPackage.deleteMany",
  "CryptoEvent.deleteMany",
  "MessageVisibility.deleteMany"
]) {
  assert.match(deletionWorkflow, new RegExp(requiredErasure.replace(".", "\\.")),
    `durable account deletion must include ${requiredErasure}`);
}
assert.match(deletionWorkflow, /lifecycleState:\s*"deleting"/,
  "deletion must freeze accounts and conversations before erasure");
assert.match(deletionWorkflow, /DeletionObjectTask/,
  "external object deletion must use durable object tasks");
assert.match(deletionWorkflow, /runMongoTransaction/,
  "Mongo deletion and durable invalidation creation must share a transaction");
assert.match(deletionWorkflow, /objectPlanCompleted:\s*true/,
  "post-freeze media inventory must expose a durable completion barrier");
assert.match(deletionWorkflow, /\$inc:\s*\{\s*claimCount:\s*1\s*\}/,
  "successful worker claims must not consume the failure retry budget");
assert.match(deletionWorkflow, /async function failWorkflow[\s\S]*?\$inc:\s*\{\s*attempts:\s*1\s*\}/,
  "only actual workflow failures may consume the failure retry budget");
const deletionRunner = deletionWorkflow.slice(deletionWorkflow.indexOf("async function runDeletionWorkflow"));
assert(deletionRunner.indexOf("freezeWorkflow") < deletionRunner.indexOf("planWorkflowObjects") &&
  deletionRunner.indexOf("planWorkflowObjects") < deletionRunner.indexOf("deleteWorkflowObjects"),
  "deletion must freeze writes before media ownership planning and physical deletion");
const dialogDeletionClient = read("client/src/crypto/mlsEngine.jsx");
const deletionClientBlock = dialogDeletionClient.slice(
  dialogDeletionClient.indexOf("async deleteConversation("),
  dialogDeletionClient.indexOf("async hideMessageForAccount(")
);
assert(deletionClientBlock.indexOf('/crypto/v4/deletions/') < deletionClientBlock.indexOf("await this.purgeConversation"),
  "the client must confirm durable completion before purging a whole chat");
assert.match(read("client/src/hooks/useDialogs.jsx"), /deleteConversation\(dialog\.chatKey/,
  "group chat deletion must use the same global conversation workflow");
assert.doesNotMatch(read("client/src/hooks/useDialogs.jsx"), /leaveGroupApi/,
  "whole-chat deletion UI must not preserve group history through a leave path");
const groupControllerSource = read("server/controllers/groupController.js");
const legacyLeaveBlock = groupControllerSource.slice(
  groupControllerSource.indexOf("async function leaveGroup"),
  groupControllerSource.indexOf("async function deleteGroup")
);
assert.match(legacyLeaveBlock, /status\(410\)/,
  "legacy group leave must remain a tombstone instead of preserving whole-chat history");
assert.doesNotMatch(legacyLeaveBlock, /\.save\(|\.updateOne\(/,
  "legacy group leave tombstone must not mutate membership");
for (const consistencyController of [
  "server/controllers/blockController.js",
  "server/controllers/notificationSettingsController.js"
]) {
  const source = read(consistencyController);
  assert.match(source, /runMongoTransaction/,
    `${consistencyController} must commit the account mutation and durable invalidation atomically`);
  assert.match(source, /ClientInvalidation\.create\(\[[\s\S]*?\{\s*session\s*\}\)/,
    `${consistencyController} must create its durable invalidation in the active transaction`);
}
const deviceControllerSource = read("server/controllers/cryptoV4/identityDevices.js");
assert.match(deviceControllerSource, /createDeviceListInvalidation\(req, session\)/,
  "device directory changes must create their durable invalidation inside the directory transaction");
assert.doesNotMatch(deviceControllerSource, /publishDeviceListUpdate/,
  "device mutations must not publish a post-commit-only invalidation");
const fullAccountPurge = read("server/scripts/purgeAllAccountData.js");
assert.match(fullAccountPurge, /DELETE_ALL_ACCOUNTS_AND_DATA/,
  "full account purge must require an explicit destructive confirmation");
assert.match(fullAccountPurge, /dry-run/,
  "full account purge must default to a dry-run");

const group = read("server/controllers/groupController.js");
const addBlock = group.slice(group.indexOf("async function addGroupMember"), group.indexOf("async function removeGroupMember"));
const removeBlock = group.slice(group.indexOf("async function removeGroupMember"), group.indexOf("async function leaveGroup"));
assert.match(addBlock, /e2eeVersion.*\+ 1/);
assert.doesNotMatch(removeBlock, /E2EEKey\.deleteMany/);

const r2 = read("server/utils/uploadToR2.js");
assert.match(r2, /R2_AVATAR/);
assert.match(r2, /R2_MEDIA/);
assert.doesNotMatch(r2, /requireEnv\("R2_BUCKET"\)/);

console.log("Security regression checks passed.");
