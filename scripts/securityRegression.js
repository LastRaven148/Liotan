const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const getChatId = require("../server/utils/getChatId");
const { normalizeEncryptedContent } = require("../server/sockets/services/encryptedContent");
const { canonicalJson } = require("../server/utils/canonicalJson");
const { verifyEd25519 } = require("../server/security/cryptoV4");
const crypto = require("crypto");

const first = getChatId("abc", "def_ghi");
const second = getChatId("abc_def", "ghi");
assert.notStrictEqual(first, second, "private conversation IDs must be collision-free");
assert.deepStrictEqual(getChatId.getPrivateChatParticipants(first), ["abc", "def_ghi"]);

const getPrivateChat = read("server/sockets/handlers/private/getPrivateChat.js");
assert.match(getPrivateChat, /from: user1, to: user2/);
assert.match(getPrivateChat, /from: user2, to: user1/);

const e2ee = read("client/src/crypto/legacy/e2eeV3ReadOnly.jsx");
assert.doesNotMatch(e2ee, /if \(!secret\) \{\s*return text;/);
assert.match(e2ee, /additionalData: canonicalAad/);
assert.match(e2ee, /Replayed E2EE envelope rejected/);
assert.match(e2ee, /conversationId: meta\.kid/);
assert.match(e2ee, /isExpectedConversation/);
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
assert.match(read("server/config/attachmentUpload.js"), /ciphertextFramingValidator/);
assert.match(read("server/config/attachmentUpload.js"), /LIOTANMLS1/);
const cryptoControllers = ["shared.js", "identityDevices.js", "conversations.js", "media.js"]
  .map(name => read(`server/controllers/cryptoV4/${name}`)).join("\n");
assert.match(cryptoControllers, /MLS ciphertext media required/);
assert.match(cryptoControllers, /unexpected MLS epoch/);
assert.match(cryptoControllers, /manifestExpiresAt/);
assert.match(read("server/models/CryptoRequestNonce.js"), /unique: true/);
const mlsClient = ["mlsEngine.jsx", "mls/constants.jsx", "mls/envelope.jsx", "mls/trust.jsx"]
  .map(name => read(`client/src/crypto/${name}`)).join("\n");
assert.match(mlsClient, /Mls128Dhkemx25519Aes128gcmSha256Ed25519/);
assert.match(mlsClient, /Safety number changed/);
assert.match(mlsClient, /assertEnvelopeSchema/);
assert.match(read("server/sockets/handlers/private/index.js"), /mls-v4-required/);

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
