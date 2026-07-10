const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const getChatId = require("../server/utils/getChatId");
const { normalizeEncryptedContent } = require("../server/sockets/services/encryptedContent");

const first = getChatId("abc", "def_ghi");
const second = getChatId("abc_def", "ghi");
assert.notStrictEqual(first, second, "private conversation IDs must be collision-free");
assert.deepStrictEqual(getChatId.getPrivateChatParticipants(first), ["abc", "def_ghi"]);

const getPrivateChat = read("server/sockets/handlers/private/getPrivateChat.js");
assert.match(getPrivateChat, /from: user1, to: user2/);
assert.match(getPrivateChat, /from: user2, to: user1/);

const e2ee = read("client/src/utils/e2ee.jsx");
assert.doesNotMatch(e2ee, /if \(!secret\) \{\s*return text;/);
assert.match(e2ee, /additionalData: canonicalAad/);
assert.match(e2ee, /Replayed E2EE envelope rejected/);
assert.match(e2ee, /kid: conversationId/);
assert.doesNotMatch(e2ee, /deriveBackupKey|encryptIdentityBackup|decryptIdentityBackup/);

const validV3 = normalizeEncryptedContent({
  ciphertext: "ciphertext",
  iv: "iv-value",
  salt: "salt-value",
  nonce: "1234567890123456",
  alg: "AES-GCM-256",
  kdf: "PBKDF2-SHA256",
  iter: 200000,
  kid: "private:v2:alice:bob",
  sender: "alice",
  contentType: "text",
  version: 3
});
assert(validV3, "server must accept a structurally valid v3 envelope");
assert.strictEqual(normalizeEncryptedContent({ ...validV3, version: 2 }), null, "server must reject legacy writes");

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
