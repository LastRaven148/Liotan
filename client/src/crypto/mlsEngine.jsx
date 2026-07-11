import {
  ClientId,
  CoreCrypto,
  Credential,
  CredentialType,
  Database,
  DatabaseKey,
  DeviceId,
  KeyPackage,
  Uuid,
  Welcome,
  initWasmModule
} from "@wireapp/core-crypto/browser";
import { deriveAccountKeys } from "./accountKeys";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJson,
  randomBytes,
  sha256Base64Url,
  textDecoder,
  textEncoder,
  wipe
} from "./encoding";
import { configureCryptoSigner, cryptoBootstrap, signedCryptoRequest } from "./cryptoApi";
import { getEncryptedRecord, listEncryptedRecords, putEncryptedRecord } from "./recoveryStore";
import {
  CORE_CRYPTO_WASM_URL,
  MLS_CIPHER_SUITE as SUITE,
  SELF_UPDATE_INTERVAL_MS
} from "./mls/constants";
import { assertEnvelopeSchema, dispatchCryptoMessage, envelopeToUiMessage } from "./mls/envelope";
import { bytesToHex, clientIdText, conversationObject, parseClientId } from "./mls/identifiers";
import {
  listCryptoDevices,
  publishKeyPackagesIfNeeded,
  registerCryptographicIdentity,
  revokeCryptoDevice
} from "./mls/identity";
import { decryptMlsMediaBlob, downloadMlsCiphertext, encryptAndUploadMedia } from "./mls/media";
import { validateLocalRoster, verifyDirectory } from "./mls/trust";
const conversationByChat = new Map();
const conversationById = new Map();
const loadedHistory = new Set();
let engine = null;

function deviceIdRecordName(username) {
  return `liotan:mls-device-id:${encodeURIComponent(username)}`;
}

function getOrCreateDeviceId(username) {
  const recordName = deviceIdRecordName(username);
  const current = String(localStorage.getItem(recordName) || "").toLowerCase();
  if (/^[0-9a-f]{16}$/.test(current)) return current;
  const created = bytesToHex(randomBytes(8));
  localStorage.setItem(recordName, created);
  return created;
}

class LiotanMlsEngine {
  constructor({ username, bootstrap, deviceId, keys }) {
    this.username = username;
    this.bootstrap = bootstrap;
    this.deviceId = deviceId;
    this.keys = keys;
    this.clientId = new ClientId(
      new Uuid(bootstrap.identity.cryptoUserId),
      DeviceId.fromHexString(deviceId),
      bootstrap.domain
    );
    this.clientIdString = clientIdText(this.clientId);
    this.pendingOperation = null;
    this.core = null;
    this.database = null;
    this.credentialRef = null;
    this.syncing = new Map();
    this.pollTimer = null;
  }

  async initialize() {
    await initWasmModule(CORE_CRYPTO_WASM_URL);
    this.database = await Database.open(
      `liotan-mls-${this.bootstrap.identity.cryptoUserId}-${this.deviceId}`,
      new DatabaseKey(this.keys.databaseKey)
    );
    this.core = CoreCrypto.new(this.database);
    const transport = {
      sendCommitBundle: bundle => this.sendCommitBundle(bundle),
      prepareForTransport: async () => {
        throw new Error("MLS history-secret transport is disabled by policy");
      }
    };
    await this.core.transaction(ctx => ctx.mlsInit(this.clientId, transport));
    const credentials = await this.core.findCredentials({
      clientId: this.clientId,
      cipherSuite: SUITE,
      credentialType: CredentialType.Basic
    });
    if (credentials.length) {
      this.credentialRef = credentials[0];
    } else {
      const credential = Credential.basic(SUITE, this.clientId);
      this.credentialRef = await this.core.transaction(ctx => ctx.addCredential(credential));
    }
    await this.registerCryptographicIdentity();
    await this.publishKeyPackagesIfNeeded();
    this.pollTimer = window.setInterval(() => this.syncAll().catch(() => {}), 15000);
  }

  async registerCryptographicIdentity() {
    return registerCryptographicIdentity(this);
  }

  async publishKeyPackagesIfNeeded() {
    return publishKeyPackagesIfNeeded(this);
  }

  async listCryptoDevices() {
    return listCryptoDevices(this);
  }

  async revokeCryptoDevice(deviceId) {
    return revokeCryptoDevice(this, deviceId);
  }

  async sendCommitBundle(bundle) {
    const operation = this.pendingOperation;
    if (!operation) throw new Error("Unexpected MLS commit without an authorized server operation");
    const groupInfo = bundle.groupInfo;
    const body = {
      epoch: operation.expectedEpoch,
      commit: bytesToBase64Url(bundle.commit),
      welcome: bundle.welcome ? bytesToBase64Url(bundle.welcome.serialize()) : "",
      groupInfo: {
        encryptionType: Number(groupInfo.encryptionType),
        ratchetTreeType: Number(groupInfo.ratchetTreeType),
        payload: bytesToBase64Url(groupInfo.payload)
      }
    };
    await putEncryptedRecord(`pending-commit:${operation.conversationId}`, body, this.keys.cacheKey);
    await signedCryptoRequest(
      `/crypto/v4/conversations/${encodeURIComponent(operation.conversationId)}/operations/${encodeURIComponent(operation.operationId)}/commit`,
      { method: "POST", body }
    );
  }

  async verifyDirectory(conversation) {
    return verifyDirectory(this, conversation);
  }

  async validateLocalRoster(conversation) {
    return validateLocalRoster(this, conversation);
  }

  chatDescriptor(chatKey, dialog = null) {
    if (dialog?.type === "group" || String(chatKey).startsWith("group:")) {
      return { chatType: "group", groupId: dialog?.groupId || String(chatKey).slice("group:".length) };
    }
    return { chatType: "private", targetUsername: String(dialog?.username || chatKey) };
  }

  async resolveConversation(chatKey, dialog = null) {
    const response = await signedCryptoRequest("/crypto/v4/conversations/resolve", {
      method: "POST",
      body: this.chatDescriptor(chatKey, dialog)
    });
    await this.verifyDirectory(response);
    const state = { ...response, chatKey: String(chatKey), dialog };
    conversationByChat.set(String(chatKey), state);
    conversationById.set(response.conversationId, state);
    await this.loadCachedHistory(state);
    window.dispatchEvent(new CustomEvent("liotan:mls-conversation-ready", {
      detail: { chatKey: String(chatKey), conversationId: response.conversationId }
    }));
    return state;
  }

  async reconcileConversation(state, options = {}) {
    const path = `/crypto/v4/conversations/${encodeURIComponent(state.conversationId)}/operations`;
    let response;
    try {
      response = await signedCryptoRequest(path, {
        method: "POST",
        body: options.forceUpdate ? { forceUpdate: true } : {}
      });
    } catch (err) {
      if (err.status === 409 && /creator must initialize|already pending/i.test(err.message)) return state;
      throw err;
    }
    if (response.noChange) {
      const refreshed = { ...state, ...response.conversation, directory: state.directory };
      conversationByChat.set(state.chatKey, refreshed);
      conversationById.set(state.conversationId, refreshed);
      return refreshed;
    }
    const operation = response.operation;
    const conversationId = conversationObject(state.conversationId);
    this.pendingOperation = operation;
    try {
      await this.core.transaction(async ctx => {
        if (operation.type === "init") {
          const exists = await ctx.conversationExists(conversationId);
          if (!exists) await ctx.createConversation(conversationId, this.credentialRef);
          if (operation.keyPackages.length) {
            await ctx.addClientsToConversation(
              conversationId,
              operation.keyPackages.map(item => new KeyPackage(base64UrlToBytes(item.payload)))
            );
          } else {
            await ctx.updateKeyingMaterial(conversationId);
          }
        } else if (operation.type === "add") {
          await ctx.addClientsToConversation(
            conversationId,
            operation.keyPackages.map(item => new KeyPackage(base64UrlToBytes(item.payload)))
          );
        } else if (operation.type === "remove") {
          await ctx.removeClientsFromConversation(
            conversationId,
            operation.removeClientIds.map(parseClientId)
          );
        } else if (operation.type === "update") {
          await ctx.updateKeyingMaterial(conversationId);
        } else {
          throw new Error("Unsupported MLS membership operation");
        }
      });
    } finally {
      this.pendingOperation = null;
    }
    return this.resolveConversation(state.chatKey, state.dialog);
  }

  async ensureConversation(chatKey, dialog = null) {
    let state = await this.resolveConversation(chatKey, dialog);
    if (state.initialized && !state.activeClientIds.includes(this.clientIdString)) {
      throw new Error("Это устройство ожидает добавления существующим MLS-устройством участника");
    }
    await this.syncConversation(state);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const desiredClientIds = state.directory
        .flatMap(user => user.devices || [])
        .map(device => device.clientId)
        .sort();
      const activeClientIds = [...state.activeClientIds].sort();
      const rosterDiffers = desiredClientIds.length !== activeClientIds.length ||
        desiredClientIds.some((item, index) => item !== activeClientIds[index]);
      if (state.initialized && !state.blockedForEpochChange && !rosterDiffers) break;
      state = await this.reconcileConversation(state);
    }
    if (!state.initialized || state.blockedForEpochChange) {
      throw new Error("MLS epoch change is pending; message was not sent");
    }
    await this.validateLocalRoster(state);
    const lastCommitAt = Date.parse(state.lastCommitAt || "");
    if (!Number.isFinite(lastCommitAt) || Date.now() - lastCommitAt >= SELF_UPDATE_INTERVAL_MS) {
      state = await this.reconcileConversation(state, { forceUpdate: true });
      await this.validateLocalRoster(state);
    }
    return state;
  }

  async cacheEnvelope(state, sequence, envelope) {
    await putEncryptedRecord(
      `message:${state.conversationId}:${envelope.clientMessageId}`,
      { sequence, envelope },
      this.keys.cacheKey
    );
    localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(sequence));
  }

  async loadCachedHistory(state) {
    if (loadedHistory.has(state.conversationId)) return;
    loadedHistory.add(state.conversationId);
    const records = await listEncryptedRecords(`message:${state.conversationId}:`, this.keys.cacheKey);
    records.sort((left, right) => Number(left?.sequence || 0) - Number(right?.sequence || 0));
    for (const record of records) {
      const envelope = record?.envelope;
      if (!envelope) continue;
      if (envelope.kind === "message") {
        dispatchCryptoMessage({ type: "message", message: this.envelopeToUiMessage(state, envelope) });
      } else {
        dispatchCryptoMessage({
          type: envelope.kind,
          chatId: this.envelopeToUiMessage(state, { ...envelope, attachment: null }).chatId,
          messageId: envelope.targetMessageId,
          text: envelope.text || "",
          from: envelope.senderUsername
        });
      }
    }
  }

  envelopeToUiMessage(state, envelope, eventCreatedAt = "") {
    return envelopeToUiMessage(state, envelope, this.username, eventCreatedAt);
  }

  validateEnvelope(state, event, decrypted, envelope) {
    assertEnvelopeSchema(envelope);
    const actualSender = decrypted.senderClientId ? clientIdText(decrypted.senderClientId) : "";
    const device = state.directory.flatMap(user => user.devices || []).find(item => item.clientId === actualSender);
    if (
      envelope?.v !== 1 ||
      envelope.conversationId !== state.conversationId ||
      envelope.clientMessageId !== event.clientMessageId ||
      envelope.senderClientId !== actualSender ||
      event.senderClientId !== actualSender ||
      !device || device.manifest.username !== envelope.senderUsername ||
      event.senderUsername !== envelope.senderUsername ||
      !["message", "edit", "delete", "pin"].includes(envelope.kind)
    ) {
      throw new Error("MLS authenticated envelope binding failed");
    }
  }

  async handleApplicationMessage(state, event, decrypted) {
    if (!decrypted.message) return;
    const envelope = JSON.parse(textDecoder.decode(decrypted.message));
    this.validateEnvelope(state, event, decrypted, envelope);
    if (["edit", "delete"].includes(envelope.kind)) {
      const targetRecord = await getEncryptedRecord(
        `message:${state.conversationId}:${envelope.targetMessageId}`,
        this.keys.cacheKey
      );
      const target = targetRecord?.envelope;
      if (!target || target.kind !== "message" || target.senderUsername !== envelope.senderUsername) {
        throw new Error("Unauthorized MLS message mutation rejected");
      }
    }
    try {
      await this.cacheEnvelope(state, event.sequence, envelope);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("MLS local cache write failed", error);
    }
    if (envelope.kind === "message") {
      dispatchCryptoMessage({ type: "message", message: this.envelopeToUiMessage(state, envelope, event.createdAt) });
    } else {
      dispatchCryptoMessage({
        type: envelope.kind,
        chatId: this.envelopeToUiMessage(state, { ...envelope, attachment: null }, event.createdAt).chatId,
        messageId: envelope.targetMessageId,
        text: envelope.text || "",
        from: envelope.senderUsername
      });
    }
  }

  async syncConversation(state) {
    if (this.syncing.has(state.conversationId)) return this.syncing.get(state.conversationId);
    const promise = (async () => {
      let after = Number(localStorage.getItem(`liotan:mls-sequence:${state.conversationId}`) || 0);
      while (true) {
        const path = `/crypto/v4/conversations/${encodeURIComponent(state.conversationId)}/events?after=${after}&limit=100`;
        let response;
        try {
          response = await signedCryptoRequest(path);
        } catch (err) {
          if (err.status === 403 && !state.initialized) return;
          throw err;
        }
        for (const event of response.events) {
          const conversationId = conversationObject(state.conversationId);
          if (event.kind === "commit") {
            const exists = await this.core.transaction(ctx => ctx.conversationExists(conversationId));
            const localEpoch = exists
              ? Number(await this.core.transaction(ctx => ctx.conversationEpoch(conversationId)))
              : -1;
            if (!exists) {
              if (!event.welcome) throw new Error("MLS Welcome is missing for this device");
              await this.core.transaction(ctx => ctx.processWelcomeMessage(new Welcome(base64UrlToBytes(event.welcome))));
              localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(event.sequence));
            } else if (localEpoch < event.epoch) {
              const result = await this.core.transaction(ctx => ctx.decryptMessage(conversationId, base64UrlToBytes(event.commit)));
              localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(event.sequence));
              for (const buffered of result.bufferedMessages || []) {
                await this.handleApplicationMessage(state, event, buffered);
              }
            }
          } else if (event.kind === "message") {
            if (event.senderClientId === this.clientIdString) {
              const cachedRecord = await getEncryptedRecord(
                `message:${state.conversationId}:${event.clientMessageId}`,
                this.keys.cacheKey
              );
              const cached = cachedRecord?.envelope;
              if (cached) {
                if (cached.kind === "message") {
                  dispatchCryptoMessage({ type: "message", message: this.envelopeToUiMessage(state, cached, event.createdAt) });
                } else {
                  dispatchCryptoMessage({
                    type: cached.kind,
                    chatId: this.envelopeToUiMessage(state, { ...cached, attachment: null }, event.createdAt).chatId,
                    messageId: cached.targetMessageId,
                    text: cached.text || "",
                    from: cached.senderUsername
                  });
                }
              }
            } else {
              const decrypted = await this.core.transaction(ctx => ctx.decryptMessage(conversationId, base64UrlToBytes(event.ciphertext)));
              localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(event.sequence));
              await this.handleApplicationMessage(state, event, decrypted);
            }
          }
          after = event.sequence;
          localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(after));
        }
        if (!response.hasMore) break;
      }
    })().finally(() => this.syncing.delete(state.conversationId));
    this.syncing.set(state.conversationId, promise);
    return promise;
  }

  async syncConversationById(conversationId) {
    const state = conversationById.get(String(conversationId));
    if (state) await this.syncConversation(state);
  }

  async refreshRosterById(conversationId) {
    const state = conversationById.get(String(conversationId));
    if (state) await this.ensureConversation(state.chatKey, state.dialog);
  }

  async syncAll() {
    for (const state of conversationById.values()) await this.syncConversation(state);
  }

  async prepareDialogs(dialogs = []) {
    for (const dialog of dialogs.slice(0, 50)) {
      const chatKey = dialog.chatKey || dialog.username || (dialog.groupId ? `group:${dialog.groupId}` : "");
      if (!chatKey) continue;
      try {
        await this.ensureConversation(chatKey, dialog);
      } catch (err) {
        if (import.meta.env.DEV) console.warn("MLS dialog sync failed", chatKey, err);
      }
    }
  }

  async encryptAndUploadMedia(state, file, clientMessageId, options = {}) {
    return encryptAndUploadMedia(state, file, clientMessageId, options);
  }

  async sendEnvelope(state, envelope) {
    const conversationId = conversationObject(state.conversationId);
    const epoch = Number(await this.core.transaction(ctx => ctx.conversationEpoch(conversationId)));
    const ciphertext = await this.core.transaction(ctx => ctx.encryptMessage(
      conversationId,
      textEncoder.encode(canonicalJson(envelope))
    ));
    const response = await signedCryptoRequest(
      `/crypto/v4/conversations/${encodeURIComponent(state.conversationId)}/messages`,
      {
        method: "POST",
        body: {
          clientMessageId: envelope.clientMessageId,
          epoch,
          ciphertext: bytesToBase64Url(ciphertext)
        }
      }
    );
    try {
      await this.cacheEnvelope(state, response.sequence, envelope);
    } catch (error) {
      // Delivery already committed. Never retry as a second message merely
      // because the encrypted local cache is full/unavailable.
      localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(response.sequence));
      if (import.meta.env.DEV) console.warn("MLS local cache write failed", error);
    }
    return response;
  }

  async sendMessage({ chatKey, dialog, text = "", file = null, mediaOptions = {}, replyTo = null }) {
    const state = await this.ensureConversation(chatKey, dialog);
    const clientMessageId = crypto.randomUUID();
    const attachment = file
      ? await this.encryptAndUploadMedia(state, file, clientMessageId, mediaOptions)
      : null;
    const envelope = {
      v: 1,
      kind: "message",
      conversationId: state.conversationId,
      clientMessageId,
      senderUsername: this.username,
      senderClientId: this.clientIdString,
      sentAt: new Date().toISOString(),
      text: String(text || "").slice(0, 20000),
      attachment,
      replyTo: replyTo ? { messageId: String(replyTo._id || replyTo.messageId || "") } : null
    };
    const response = await this.sendEnvelope(state, envelope);
    const message = this.envelopeToUiMessage(state, envelope, new Date().toISOString());
    dispatchCryptoMessage({ type: "message", message });
    return { ok: true, response, message };
  }

  async sendControl({ chatKey, dialog, kind, targetMessageId, text = "" }) {
    if (!["edit", "delete", "pin"].includes(kind)) throw new Error("Invalid MLS control event");
    const state = await this.ensureConversation(chatKey, dialog);
    const envelope = {
      v: 1,
      kind,
      conversationId: state.conversationId,
      clientMessageId: crypto.randomUUID(),
      senderUsername: this.username,
      senderClientId: this.clientIdString,
      sentAt: new Date().toISOString(),
      targetMessageId: String(targetMessageId || ""),
      text: kind === "edit" ? String(text || "").slice(0, 20000) : ""
    };
    await this.sendEnvelope(state, envelope);
    dispatchCryptoMessage({
      type: kind,
      chatId: this.envelopeToUiMessage(state, { ...envelope, attachment: null }).chatId,
      messageId: envelope.targetMessageId,
      text: envelope.text,
      from: this.username
    });
    return { ok: true };
  }
}

export async function initializeMlsEngine({ username, recoveryKey }) {
  if (engine?.username === username) return engine;
  const deviceId = getOrCreateDeviceId(username);
  const bootstrap = await cryptoBootstrap(deviceId);
  const keys = await deriveAccountKeys(recoveryKey, bootstrap.identity.cryptoUserId, deviceId);
  const next = new LiotanMlsEngine({ username, bootstrap, deviceId, keys });
  try {
    await next.initialize();
    engine = next;
    window.dispatchEvent(new CustomEvent("liotan:mls-ready"));
    return engine;
  } catch (err) {
    wipe(keys.rootSecretKey);
    wipe(keys.requestSecretKey);
    wipe(keys.databaseKey);
    wipe(keys.cacheKey);
    throw err;
  }
}

export function getMlsEngine() {
  if (!engine) throw new Error("End-to-end encryption is locked");
  return engine;
}

export function getConversationSecurityInfo(chatKey) {
  const state = conversationByChat.get(String(chatKey || ""));
  if (!state?.directory?.length) return null;
  const roots = state.directory
    .map(user => ({ username: user.username, rootFingerprint: user.identity?.rootFingerprint || "" }))
    .sort((left, right) => left.username.localeCompare(right.username));
  if (roots.some(item => !item.rootFingerprint)) return null;
  const fingerprint = sha256Base64Url(canonicalJson(["liotan-safety-number-v1", roots]));
  return {
    protocol: "MLS 1.0 (RFC 9420)",
    conversationId: state.conversationId,
    fingerprint,
    formatted: fingerprint.match(/.{1,5}/g)?.join(" ") || fingerprint,
    participants: roots.map(item => item.username)
  };
}

export function resetMlsEngine() {
  if (engine?.pollTimer) window.clearInterval(engine.pollTimer);
  engine?.database?.close?.().catch?.(() => {});
  if (engine?.keys) {
    wipe(engine.keys.rootSecretKey);
    wipe(engine.keys.requestSecretKey);
    wipe(engine.keys.databaseKey);
    wipe(engine.keys.cacheKey);
  }
  engine = null;
  configureCryptoSigner(null);
  conversationByChat.clear();
  conversationById.clear();
  loadedHistory.clear();
}

export { decryptMlsMediaBlob, downloadMlsCiphertext };
