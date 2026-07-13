import {
  CoreCrypto,
  Credential,
  CredentialType,
  KeyPackage,
  Welcome
} from "@wireapp/core-crypto/browser";
import { deriveAccountKeys, signCanonical } from "./accountKeys";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJson,
  randomId,
  randomBytes,
  sha256Base64Url,
  textDecoder,
  textEncoder,
  wipe
} from "./encoding";
import { configureCryptoSigner, cryptoBootstrap, signedCryptoRequest } from "./cryptoApi";
import { getEncryptedRecord, listEncryptedRecords, putEncryptedRecord } from "./recoveryStore";
import {
  MLS_CIPHER_SUITE as SUITE,
  SELF_UPDATE_INTERVAL_MS
} from "./mls/constants";
import { assertEnvelopeSchema, dispatchCryptoMessage, envelopeToUiMessage } from "./mls/envelope";
import {
  bytesToHex,
  clientIdText,
  constantTimeTextEqual,
  conversationObject,
  createInitializedClientIdentity,
  parseClientId
} from "./mls/identifiers";
import {
  deleteCoreCryptoDatabase,
  getCoreCryptoDatabaseName,
  openCoreCryptoDatabase,
  shouldAutomaticallyRepairDatabase
} from "./mls/databaseStorage";
import { MlsStorageError, reportCryptoDiagnostic } from "./mls/storageError";
import {
  listCryptoDevices,
  publishKeyPackagesIfNeeded,
  registerCryptographicIdentity,
  revokeCryptoDevice
} from "./mls/identity";
import { decryptMlsMediaBlob, downloadMlsCiphertext, encryptAndUploadMedia } from "./mls/media";
import { validateLocalRoster, verifyDirectory } from "./mls/trust";
import { destroyUniffi, destroyUniffiAll } from "./mls/uniffiLifecycle";
const conversationByChat = new Map();
const conversationById = new Map();
const loadedHistory = new Set();
let engine = null;
let engineInitialization = null;
let engineInitializationUsername = "";
let engineGeneration = 0;

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

function removeDeviceId(username, expectedDeviceId) {
  const recordName = deviceIdRecordName(username);
  const current = String(localStorage.getItem(recordName) || "").toLowerCase();
  if (current === String(expectedDeviceId || "").toLowerCase()) localStorage.removeItem(recordName);
}

class LiotanMlsEngine {
  constructor({ username, bootstrap, deviceId, keys }) {
    this.username = username;
    this.bootstrap = bootstrap;
    this.deviceId = deviceId;
    this.keys = keys;
    // No UniFFI object may be constructed before CoreCrypto WASM is ready.
    // Keeping the constructor data-only makes the production cold-start path
    // obey the same ordering as the browser probes.
    this.clientId = null;
    this.clientIdString = "";
    this.pendingOperation = null;
    this.core = null;
    this.database = null;
    this.credentialRef = null;
    this.syncing = new Map();
    this.pollTimer = null;
    this.initializationStage = "created";
    this.databaseName = getCoreCryptoDatabaseName(bootstrap.identity.cryptoUserId, deviceId);
  }

  async initialize() {
    this.initializationStage = "wasm";
    const identity = await createInitializedClientIdentity({
      cryptoUserId: this.bootstrap.identity.cryptoUserId,
      deviceId: this.deviceId,
      domain: this.bootstrap.domain
    });
    this.clientId = identity.clientId;
    this.clientIdString = identity.clientIdString;
    this.initializationStage = "database-open";
    const opened = await openCoreCryptoDatabase({
      cryptoUserId: this.bootstrap.identity.cryptoUserId,
      deviceId: this.deviceId,
      databaseKey: this.keys.databaseKey
    });
    this.database = opened.database;
    this.initializationStage = "core-create";
    this.core = CoreCrypto.new(this.database);
    const transport = {
      sendCommitBundle: bundle => this.sendCommitBundle(bundle),
      prepareForTransport: async () => {
        throw new Error("MLS history-secret transport is disabled by policy");
      }
    };
    this.initializationStage = "mls-init";
    await this.core.transaction(ctx => ctx.mlsInit(this.clientId, transport));
    this.initializationStage = "credential-load";
    const credentials = await this.core.findCredentials({
      clientId: this.clientId,
      cipherSuite: SUITE,
      credentialType: CredentialType.Basic
    });
    if (credentials.length) {
      this.credentialRef = credentials[0];
      destroyUniffiAll(credentials.slice(1));
    } else {
      const credential = Credential.basic(SUITE, this.clientId);
      try {
        this.credentialRef = await this.core.transaction(ctx => ctx.addCredential(credential));
      } finally {
        destroyUniffi(credential);
      }
    }
    this.initializationStage = "device-registration";
    await this.registerCryptographicIdentity();
    this.initializationStage = "key-package-publication";
    await this.publishKeyPackagesIfNeeded();
    this.pollTimer = window.setInterval(() => this.syncAll().catch(() => {}), 15000);
    this.initializationStage = "ready";
  }

  async closeDatabase() {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    const database = this.database;
    const core = this.core;
    const credentialRef = this.credentialRef;
    const clientId = this.clientId;
    this.database = null;
    this.core = null;
    this.credentialRef = null;
    this.clientId = null;
    this.clientIdString = "";
    destroyUniffi(credentialRef);
    destroyUniffi(core);
    destroyUniffi(clientId);
    if (database) {
      await database.close().catch(() => {});
      destroyUniffi(database);
    }
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
    try {
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
    } finally {
      destroyUniffi(bundle.welcome);
    }
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
    const operationObjects = [];
    this.pendingOperation = operation;
    try {
      await this.core.transaction(async ctx => {
        if (operation.type === "init") {
          const exists = await ctx.conversationExists(conversationId);
          if (!exists) await ctx.createConversation(conversationId, this.credentialRef);
          if (operation.keyPackages.length) {
            const keyPackages = operation.keyPackages.map(item => {
              const keyPackage = new KeyPackage(base64UrlToBytes(item.payload));
              operationObjects.push(keyPackage);
              return keyPackage;
            });
            await ctx.addClientsToConversation(
              conversationId,
              keyPackages
            );
          } else {
            await ctx.updateKeyingMaterial(conversationId);
          }
        } else if (operation.type === "add") {
          const keyPackages = operation.keyPackages.map(item => {
            const keyPackage = new KeyPackage(base64UrlToBytes(item.payload));
            operationObjects.push(keyPackage);
            return keyPackage;
          });
          await ctx.addClientsToConversation(
            conversationId,
            keyPackages
          );
        } else if (operation.type === "remove") {
          const removeClientIds = operation.removeClientIds.map(item => {
            const clientId = parseClientId(item);
            operationObjects.push(clientId);
            return clientId;
          });
          await ctx.removeClientsFromConversation(
            conversationId,
            removeClientIds
          );
        } else if (operation.type === "update") {
          await ctx.updateKeyingMaterial(conversationId);
        } else {
          throw new Error("Unsupported MLS membership operation");
        }
      });
    } finally {
      this.pendingOperation = null;
      destroyUniffiAll(operationObjects);
      destroyUniffi(conversationId);
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
    try {
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
    } finally {
      destroyUniffi(decrypted.senderClientId);
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
          if (err.status === 403) {
            if (conversationById.get(state.conversationId) === state) {
              conversationById.delete(state.conversationId);
            }
            if (conversationByChat.get(state.chatKey) === state) {
              conversationByChat.delete(state.chatKey);
            }
            window.dispatchEvent(new CustomEvent("liotan:mls-conversation-unavailable", {
              detail: { chatKey: state.chatKey, conversationId: state.conversationId }
            }));
            throw new Error("MLS-доступ к чату изменился. Откройте чат повторно для безопасной синхронизации.");
          }
          throw err;
        }
        for (const event of response.events) {
          const conversationId = conversationObject(state.conversationId);
          try {
            if (event.kind === "commit") {
              const exists = await this.core.transaction(ctx => ctx.conversationExists(conversationId));
              const localEpoch = exists
                ? Number(await this.core.transaction(ctx => ctx.conversationEpoch(conversationId)))
                : -1;
              if (!exists) {
                if (!event.welcome) throw new Error("MLS Welcome is missing for this device");
                const welcome = new Welcome(base64UrlToBytes(event.welcome));
                try {
                  await this.core.transaction(ctx => ctx.processWelcomeMessage(welcome));
                } finally {
                  destroyUniffi(welcome);
                }
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
          } finally {
            destroyUniffi(conversationId);
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
    let epoch;
    let ciphertext;
    try {
      epoch = Number(await this.core.transaction(ctx => ctx.conversationEpoch(conversationId)));
      ciphertext = await this.core.transaction(ctx => ctx.encryptMessage(
        conversationId,
        textEncoder.encode(canonicalJson(envelope))
      ));
    } finally {
      destroyUniffi(conversationId);
    }
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

function wipeEngineKeys(keys) {
  if (!keys) return;
  wipe(keys.rootSecretKey);
  wipe(keys.requestSecretKey);
  wipe(keys.databaseKey);
  wipe(keys.cacheKey);
}

async function createInitializedEngine({ username, recoveryKey, generation }) {
  const deviceId = getOrCreateDeviceId(username);
  const bootstrap = await cryptoBootstrap(deviceId);
  const keys = await deriveAccountKeys(recoveryKey, bootstrap.identity.cryptoUserId, deviceId);
  let next = new LiotanMlsEngine({ username, bootstrap, deviceId, keys });
  let automaticRepairAttempted = false;
  try {
    try {
      await next.initialize();
    } catch (firstError) {
      const failedStage = next.initializationStage;
      await next.closeDatabase();
      const latestBootstrap = await cryptoBootstrap(deviceId).catch(() => bootstrap);
      const isStorageStage = shouldAutomaticallyRepairDatabase(failedStage, null);
      if (!isStorageStage) {
        throw new MlsStorageError(
          failedStage === "wasm"
            ? "The browser could not initialize the CoreCrypto runtime"
            : "The protected messaging service could not finish initialization",
          {
            code: failedStage === "wasm" ? "mls-runtime-unavailable" : "mls-startup-failed",
            stage: failedStage,
            cause: firstError
          }
        );
      }
      const mayRepair = shouldAutomaticallyRepairDatabase(failedStage, latestBootstrap.device);
      if (!mayRepair) {
        throw new MlsStorageError(
          latestBootstrap.device
            ? "Зарегистрированное MLS-хранилище не удалось открыть. Требуется безопасное восстановление устройства."
            : "Не удалось открыть локальное MLS-хранилище.",
          {
            code: latestBootstrap.device ? "registered-storage-unavailable" : "mls-initialization-failed",
            stage: failedStage,
            registeredDevice: Boolean(latestBootstrap.device),
            cause: firstError
          }
        );
      }

      automaticRepairAttempted = true;
      await deleteCoreCryptoDatabase(next.databaseName);
      next = new LiotanMlsEngine({ username, bootstrap: latestBootstrap, deviceId, keys });
      try {
        await next.initialize();
      } catch (retryError) {
        const retryStage = next.initializationStage;
        await next.closeDatabase();
        const afterRetry = await cryptoBootstrap(deviceId).catch(() => latestBootstrap);
        throw new MlsStorageError(
          afterRetry.device
            ? "MLS-устройство зарегистрировано, но его хранилище недоступно. Используйте безопасное восстановление."
            : "Повторное создание локального MLS-хранилища не удалось.",
          {
            code: afterRetry.device ? "registered-storage-unavailable" : "mls-storage-repair-failed",
            stage: retryStage,
            registeredDevice: Boolean(afterRetry.device),
            automaticRepairAttempted,
            cause: retryError
          }
        );
      }
    }
    if (generation !== engineGeneration) {
      await next.closeDatabase();
      throw new MlsStorageError("Инициализация защищённой сессии была отменена.", {
        code: "mls-initialization-cancelled",
        stage: next.initializationStage
      });
    }
    engine = next;
    window.dispatchEvent(new CustomEvent("liotan:mls-ready"));
    return engine;
  } catch (err) {
    reportCryptoDiagnostic(err, { stage: next.initializationStage });
    await next.closeDatabase();
    configureCryptoSigner(null);
    wipeEngineKeys(keys);
    throw err;
  }
}

export function initializeMlsEngine({ username, recoveryKey }) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) return Promise.reject(new TypeError("Authenticated username is required"));
  if (engine?.username === cleanUsername) return Promise.resolve(engine);
  if (engineInitialization) {
    if (engineInitializationUsername !== cleanUsername) {
      return Promise.reject(new Error("Another MLS account is already initializing"));
    }
    return engineInitialization;
  }
  const generation = engineGeneration;
  engineInitializationUsername = cleanUsername;
  engineInitialization = createInitializedEngine({ username: cleanUsername, recoveryKey, generation })
    .finally(() => {
      engineInitialization = null;
      engineInitializationUsername = "";
    });
  return engineInitialization;
}

export async function reprovisionMlsDevice({ username, recoveryKey }) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername || !recoveryKey) throw new TypeError("Recovery key is required for device recovery");
  if (engine || engineInitialization) throw new Error("Close the active MLS session before device recovery");

  const oldDeviceId = getOrCreateDeviceId(cleanUsername);
  const bootstrap = await cryptoBootstrap(oldDeviceId);
  const keys = await deriveAccountKeys(recoveryKey, bootstrap.identity.cryptoUserId, oldDeviceId);
  try {
    const derivedRoot = bytesToBase64Url(keys.rootPublicKey);
    if (!bootstrap.identity.rootPublicKey || !constantTimeTextEqual(bootstrap.identity.rootPublicKey, derivedRoot)) {
      throw new Error("Recovery key does not match the account identity");
    }
    if (bootstrap.device?.status === "active") {
      configureCryptoSigner({ deviceId: oldDeviceId, requestSecretKey: keys.requestSecretKey });
      const revocation = {
        cryptoUserId: bootstrap.identity.cryptoUserId,
        deviceId: oldDeviceId,
        revokedAt: new Date().toISOString(),
        nonce: randomId(24)
      };
      const signature = await signCanonical(keys.rootSecretKey, "liotan-device-revocation-v1", revocation);
      await signedCryptoRequest(`/crypto/v4/devices/${encodeURIComponent(oldDeviceId)}/revoke`, {
        method: "POST",
        body: { revocation, signature }
      });
    }
    configureCryptoSigner(null);
    await deleteCoreCryptoDatabase(getCoreCryptoDatabaseName(bootstrap.identity.cryptoUserId, oldDeviceId));
    removeDeviceId(cleanUsername, oldDeviceId);
  } finally {
    configureCryptoSigner(null);
    wipeEngineKeys(keys);
  }
  return initializeMlsEngine({ username: cleanUsername, recoveryKey });
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

export async function resetMlsEngine() {
  engineGeneration += 1;
  const pending = engineInitialization;
  if (pending) await pending.catch(() => {});
  const current = engine;
  engine = null;
  if (current) {
    await current.closeDatabase();
    wipeEngineKeys(current.keys);
  }
  configureCryptoSigner(null);
  conversationByChat.clear();
  conversationById.clear();
  loadedHistory.clear();
}

export { decryptMlsMediaBlob, downloadMlsCiphertext };
