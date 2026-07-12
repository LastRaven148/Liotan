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
assert.doesNotMatch(e2ee, /getE2EEConversationKeyApi|getE2EEIdentitiesApi/);

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
for (const endpoint of ["/e2ee/identity", "/e2ee/identity-backup", "/e2ee/conversations/:conversationId/key"]) {
  const route = legacyRoutes.slice(legacyRoutes.indexOf(`\"${endpoint}\"`));
  assert(route.indexOf("legacyWriteGone") >= 0 && route.indexOf("legacyWriteGone") < route.indexOf(");"),
    `${endpoint} must remain permanently gone`);
}

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
const mlsClient = ["mlsEngine.jsx", "mls/constants.jsx", "mls/envelope.jsx", "mls/trust.jsx", "mls/identifiers.jsx"]
  .map(name => read(`client/src/crypto/${name}`)).join("\n");
assert.match(mlsClient, /Mls128Dhkemx25519Aes128gcmSha256Ed25519/);
assert.match(mlsClient, /Safety number changed/);
assert.match(mlsClient, /assertEnvelopeSchema/);
assert.match(mlsClient, /initializeCoreCryptoRuntime/);
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
const clientSources = fs.readdirSync(path.join(root, "client", "src"), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(?:js|jsx|html)$/.test(entry.name))
  .map(entry => read(path.relative(root, path.join(entry.parentPath, entry.name))))
  .join("\n");
assert.doesNotMatch(clientSources, /static\.cloudflareinsights\.com|beacon\.min\.js/,
  "Cloudflare Insights beacon must not be injected by source code");
assert.match(read("server/sockets/handlers/private/index.js"), /mls-v4-required/);
assert(!fs.existsSync(path.join(root, "server/sockets/handlers/private/sendPrivateMessage.js")),
  "dead duplicate legacy private write handler must stay removed");
assert(!fs.existsSync(path.join(root, "server/sockets/handlers/group/sendGroupMessage.js")),
  "dead duplicate legacy group write handler must stay removed");

assert.match(read("server/config/version.js"), /require\("\.\.\/package\.json"\)/,
  "runtime version must be sourced from server/package.json");
assert.match(read("server/routes/healthRoutes.js"), /service: "liotan-api",\s*version/,
  "health endpoint must expose the actual package version");

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
