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
import { configureCryptoSigner, cryptoBootstrap, signedCryptoRequest, unsignedCryptoPost } from "./cryptoApi";
import {
  getEncryptedRecord,
  getEncryptedHistoryRecord,
  listEncryptedHistoryRecords,
  deleteEncryptedConversationData,
  deleteEncryptedMessageRecord,
  deleteLocalCryptoStore,
  deleteDeviceRequestSecret,
  loadOrCreateDeviceRequestSecret,
  migrateEncryptedHistoryRecords,
  putEncryptedHistoryRecord,
  putEncryptedHistoryRecords,
  putEncryptedRecord
} from "./recoveryStore";
import { clearOfflineMedia, deleteOfflineBlobs } from "../components/chat/message/messageStorage";
import {
  BACKGROUND_MAINTENANCE_INTERVAL_MS,
  MLS_CIPHER_SUITE as SUITE,
  SELF_UPDATE_INTERVAL_MS
} from "./mls/constants";
import { assertEnvelopeSchema, dispatchCryptoMessage, envelopeToUiMessage } from "./mls/envelope";
import {
  applyMessageMutation,
  initialMessageMutationState,
  mutationUiMetadata,
  nextMutationBinding
} from "./mls/messageMutations.mjs";
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
import { buildDirectoryMutation } from "./mls/directory";
import { reconcileSyncCursor, validateRecipientEventPage } from "./mls/syncCursor";
import {
  approveCryptoDevice,
  listCryptoDevices,
  publishKeyPackagesIfNeeded,
  registerCryptographicIdentity,
  renewCryptoDeviceManifestIfNeeded,
  revokeCryptoDevice
} from "./mls/identity";
import { decryptMlsMediaBlob, downloadMlsCiphertext, encryptAndUploadMedia } from "./mls/media";
import {
  markDirectoryVerified,
  observeTransparencyGossip,
  validateLocalRoster,
  verifyAndPinAccountDirectory,
  verifyDirectory
} from "./mls/trust";
import { destroyUniffi, destroyUniffiAll } from "./mls/uniffiLifecycle";
const conversationByChat = new Map();
const conversationById = new Map();
const loadedHistory = new Set();
const hiddenMessagesByConversation = new Map();
const CONVERSATION_DIRECTORY_TTL_MS = 60 * 1000;
const CONVERSATION_FAST_SYNC_TTL_MS = 3000;
const INITIAL_HISTORY_LIMIT = 80;
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
    this.resolving = new Map();
    this.ensuring = new Map();
    this.sendQueues = new Map();
    this.mutationQueues = new Map();
    this.historyMigrations = new Map();
    this.deletionRequests = new Map();
    this.purgingConversations = new Set();
    this.invalidationSync = null;
    this.closing = false;
    this.pollTimer = null;
    this.maintenanceTimer = null;
    this.manifestRenewalTimer = null;
    this.manifestRenewalFailures = 0;
    this.maintenanceQueue = new Map();
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
    this.initializationStage = "manifest-renewal";
    await this.runManifestRenewal();
    this.initializationStage = "client-invalidation-sync";
    await this.syncInvalidations();
    this.pollTimer = window.setInterval(() => this.syncAll().catch(error => {
      if (import.meta.env.DEV) console.warn("MLS periodic sync failed", error);
    }), 15000);
    this.maintenanceTimer = window.setInterval(() => {
      this.maintainNextDialog().catch(error => {
        if (import.meta.env.DEV) console.warn("MLS background maintenance failed", error);
      });
    }, BACKGROUND_MAINTENANCE_INTERVAL_MS);
    this.initializationStage = "ready";
  }

  async hiddenMessages(conversationId) {
    const key = String(conversationId || "");
    if (hiddenMessagesByConversation.has(key)) return hiddenMessagesByConversation.get(key);
    const record = await getEncryptedRecord(`hidden-messages:${key}`, this.keys.cacheKey);
    const values = new Set(Array.isArray(record?.messageIds) ? record.messageIds.map(String) : []);
    hiddenMessagesByConversation.set(key, values);
    return values;
  }

  async rememberHiddenMessage(conversationId, clientMessageId) {
    const values = await this.hiddenMessages(conversationId);
    values.add(String(clientMessageId));
    await putEncryptedRecord(`hidden-messages:${conversationId}`, {
      v: 1,
      conversationId,
      messageIds: [...values].sort()
    }, this.keys.cacheKey);
  }

  attachmentOfflineKeys(attachment) {
    if (!attachment) return [];
    const media = attachment.mlsMedia || {};
    return [attachment.mediaId, attachment.uploadId, attachment.url, media.mediaId, media.uploadId, media.url]
      .filter(Boolean)
      .map(String);
  }

  async purgeConversation(conversationId, chatKey = "") {
    const id = String(conversationId || "");
    const state = conversationById.get(id);
    const resolvedChatKey = String(chatKey || state?.chatKey || "");
    if (!id) {
      if (resolvedChatKey) {
        window.dispatchEvent(new CustomEvent("liotan:mls-event", {
          detail: { type: "conversation-delete", conversationId: "", chatKey: resolvedChatKey }
        }));
      }
      return;
    }
    this.purgingConversations.add(id);
    await Promise.allSettled([
      this.historyMigrations.get(id),
      this.syncing.get(id)
    ].filter(Boolean));
    const offlineKeys = [];
    let beforeSequence = null;
    while (true) {
      const records = await listEncryptedHistoryRecords(id, this.keys.cacheKey, {
        limit: 200,
        ...(beforeSequence === null ? {} : { beforeSequence })
      });
      records.forEach(record => offlineKeys.push(...this.attachmentOfflineKeys(record?.envelope?.attachment)));
      if (records.length < 200) break;
      beforeSequence = Math.min(...records.map(record => Number(record?.sequence || 0)).filter(Boolean));
      if (!beforeSequence) break;
    }
    if (offlineKeys.length) await deleteOfflineBlobs(offlineKeys);
    const conversationIdObject = conversationObject(id);
    try {
      const exists = await this.core.transaction(ctx => ctx.conversationExists(conversationIdObject));
      if (exists) await this.core.transaction(ctx => ctx.wipeConversation(conversationIdObject));
    } finally {
      destroyUniffi(conversationIdObject);
    }
    await deleteEncryptedConversationData(id);
    localStorage.removeItem(`liotan:mls-sequence:${id}`);
    loadedHistory.delete(id);
    hiddenMessagesByConversation.delete(id);
    this.historyMigrations.delete(id);
    if (state) {
      conversationById.delete(id);
      if (conversationByChat.get(state.chatKey) === state) conversationByChat.delete(state.chatKey);
      this.maintenanceQueue.delete(state.chatKey);
    }
    window.dispatchEvent(new CustomEvent("liotan:mls-event", {
      detail: { type: "conversation-delete", conversationId: id, chatKey: resolvedChatKey }
    }));
  }

  async applyInvalidation(item) {
    if (item.kind === "message-hidden") {
      const cached = await this.findCachedEnvelope(item.conversationId, item.clientMessageId);
      const state = conversationById.get(String(item.conversationId));
      await this.rememberHiddenMessage(item.conversationId, item.clientMessageId);
      await deleteEncryptedMessageRecord(item.conversationId, item.clientMessageId);
      const offlineKeys = this.attachmentOfflineKeys(cached?.envelope?.attachment);
      if (offlineKeys.length) await deleteOfflineBlobs(offlineKeys);
      if (state && cached?.envelope) {
        window.dispatchEvent(new CustomEvent("liotan:mls-event", {
          detail: {
            type: "delete",
            chatId: this.envelopeToUiMessage(state, { ...(cached?.envelope || {}), attachment: null }).chatId,
            messageId: item.clientMessageId,
            localOnly: true
          }
        }));
      }
      return;
    }
    if (["conversation-deleted", "account-deleted"].includes(item.kind)) {
      await this.purgeConversation(item.conversationId, item.chatKey);
      return;
    }
    window.dispatchEvent(new CustomEvent("liotan:account-state-invalidated", { detail: item }));
  }

  async syncInvalidations() {
    if (this.invalidationSync) return this.invalidationSync;
    this.invalidationSync = (async () => {
      let cursor = "";
      do {
        const path = `/crypto/v4/invalidations?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const page = await signedCryptoRequest(path);
        for (const item of page.invalidations || []) {
          await this.applyInvalidation(item);
          await signedCryptoRequest(`/crypto/v4/invalidations/${encodeURIComponent(item.eventId)}/ack`, {
            method: "POST",
            body: {}
          });
        }
        cursor = page.hasMore ? String(page.nextCursor || "") : "";
      } while (cursor);
    })().finally(() => { this.invalidationSync = null; });
    return this.invalidationSync;
  }

  async deleteConversation(chatKey, dialog = null) {
    const state = conversationByChat.get(String(chatKey)) || await this.resolveConversation(chatKey, dialog);
    const existing = this.deletionRequests.get(state.conversationId);
    if (existing) return existing;
    const request = (async () => {
      let result = await signedCryptoRequest(
        `/crypto/v4/conversations/${encodeURIComponent(state.conversationId)}/deletion`,
        {
          method: "POST",
          body: { confirm: true },
          headers: { "Idempotency-Key": randomId(24) }
        }
      );
      for (let attempt = 0; result?.state !== "completed" && !result?.terminal && attempt < 30; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, Math.min(5000, 750 * (attempt + 1))));
        result = await signedCryptoRequest(
          `/crypto/v4/deletions/${encodeURIComponent(result.workflowId)}`
        );
      }
      if (result?.state !== "completed") {
        const error = new Error(result?.terminal
          ? "Conversation deletion requires operator reconciliation."
          : "Conversation deletion is still removing encrypted media. Retry status shortly.");
        error.code = result?.terminal ? "conversation-deletion-blocked" : "conversation-deletion-pending";
        error.workflowId = result?.workflowId || "";
        throw error;
      }
      await this.purgeConversation(state.conversationId, state.chatKey);
      return result;
    })();
    this.deletionRequests.set(state.conversationId, request);
    try {
      return await request;
    } finally {
      this.deletionRequests.delete(state.conversationId);
    }
  }

  async hideMessageForAccount(chatKey, dialog, clientMessageId) {
    const state = conversationByChat.get(String(chatKey)) || await this.ensureConversation(chatKey, dialog);
    await signedCryptoRequest(
      `/crypto/v4/conversations/${encodeURIComponent(state.conversationId)}/messages/${encodeURIComponent(clientMessageId)}/hide`,
      { method: "POST", body: {} }
    );
    await this.syncInvalidations();
  }

  async closeDatabase() {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.maintenanceTimer) window.clearInterval(this.maintenanceTimer);
    this.maintenanceTimer = null;
    if (this.manifestRenewalTimer) window.clearTimeout(this.manifestRenewalTimer);
    this.manifestRenewalTimer = null;
    this.maintenanceQueue.clear();
    this.deletionRequests.clear();
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

  scheduleManifestRenewal(delayMs) {
    if (this.closing) return;
    if (this.manifestRenewalTimer) window.clearTimeout(this.manifestRenewalTimer);
    this.manifestRenewalTimer = window.setTimeout(() => this.runManifestRenewal(), delayMs);
  }

  async runManifestRenewal() {
    try {
      await renewCryptoDeviceManifestIfNeeded(this);
      this.manifestRenewalFailures = 0;
      this.scheduleManifestRenewal(24 * 60 * 60 * 1000);
    } catch (error) {
      this.manifestRenewalFailures += 1;
      const retryMs = Math.min(6 * 60 * 60 * 1000, 30 * 1000 * (2 ** Math.min(10, this.manifestRenewalFailures - 1)));
      this.scheduleManifestRenewal(retryMs);
      if (import.meta.env.DEV) console.warn("Cryptographic device manifest renewal failed", error);
    }
  }

  async listCryptoDevices() {
    return listCryptoDevices(this);
  }

  async approveCryptoDevice(deviceId) {
    return approveCryptoDevice(this, deviceId);
  }

  async revokeCryptoDevice(deviceId) {
    return revokeCryptoDevice(this, deviceId);
  }

  async markConversationSafetyVerified(chatKey) {
    const state = conversationByChat.get(String(chatKey || ""));
    if (!state?.ready || !state.directory?.length) throw new Error("Protected conversation is not ready");
    const trustStates = { ...(state.trustStates || {}) };
    for (const user of state.directory) {
      trustStates[user.username] = await markDirectoryVerified(this, user.username, user.identity);
    }
    state.trustStates = trustStates;
    window.dispatchEvent(new CustomEvent("liotan:e2ee-updated", {
      detail: { chatKey: state.chatKey, reason: "safety-verified" }
    }));
    return getConversationSecurityInfo(state.chatKey);
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
        },
        result: {
          v: 1,
          operationId: operation.operationId,
          baseRosterVersion: operation.baseRosterVersion,
          baseEpoch: operation.baseEpoch,
          operationGeneration: operation.operationGeneration,
          intentHash: operation.intentHash,
          activeClientIds: operation.expectedActiveClientIds,
          activeClientIdsHash: operation.expectedActiveClientIdsHash
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

  async resolveConversation(chatKey, dialog = null, options = {}) {
    const key = String(chatKey);
    const cached = conversationByChat.get(key);
    const cacheFresh = cached && Date.now() - Number(cached.resolvedAt || 0) < CONVERSATION_DIRECTORY_TTL_MS;
    if (!options.force && cacheFresh) {
      if (dialog && cached.dialog !== dialog) cached.dialog = dialog;
      return cached;
    }
    if (this.resolving.has(key)) return this.resolving.get(key);
    const promise = (async () => {
      const response = await signedCryptoRequest("/crypto/v4/conversations/resolve", {
        method: "POST",
        body: this.chatDescriptor(key, dialog)
      });
      response.trustStates = await this.verifyDirectory(response);
      const state = {
        ...response,
        chatKey: key,
        dialog,
        ready: false,
        resolvedAt: Date.now(),
        lastSyncedAt: 0
      };
      conversationByChat.set(key, state);
      conversationById.set(response.conversationId, state);
      try {
        await this.loadCachedHistory(state);
      } catch (error) {
        // Local history is an encrypted convenience cache. A transient cache
        // failure must not make an otherwise healthy MLS conversation unusable.
        if (import.meta.env.DEV) console.warn("Encrypted MLS history cache unavailable", error);
      }
      return state;
    })().finally(() => this.resolving.delete(key));
    this.resolving.set(key, promise);
    return promise;
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
    } catch (error) {
      if (error?.status === 409 && /stale|no longer current|operation intent/i.test(error.message || "")) {
        return this.resolveConversation(state.chatKey, state.dialog, { force: true });
      }
      throw error;
    } finally {
      this.pendingOperation = null;
      destroyUniffiAll(operationObjects);
      destroyUniffi(conversationId);
    }
    return this.resolveConversation(state.chatKey, state.dialog, { force: true });
  }

  async ensureConversation(chatKey, dialog = null, options = {}) {
    const key = String(chatKey);
    const cached = conversationByChat.get(key);
    if (!options.forceDirectory && cached?.ready &&
      Date.now() - Number(cached.resolvedAt || 0) < CONVERSATION_DIRECTORY_TTL_MS) {
      if (Date.now() - Number(cached.lastSyncedAt || 0) >= CONVERSATION_FAST_SYNC_TTL_MS) {
        await this.syncConversation(cached);
      }
      return cached;
    }
    if (this.ensuring.has(key)) return this.ensuring.get(key);
    const promise = (async () => {
      let state = await this.resolveConversation(key, dialog, { force: Boolean(options.forceDirectory) });
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
      state.ready = true;
      state.readyAt = Date.now();
      state.lastSyncedAt = Date.now();
      conversationByChat.set(key, state);
      conversationById.set(state.conversationId, state);
      window.dispatchEvent(new CustomEvent("liotan:mls-conversation-ready", {
        detail: { chatKey: key, conversationId: state.conversationId }
      }));
      return state;
    })().catch(error => {
      const state = conversationByChat.get(key);
      if (state) state.ready = false;
      window.dispatchEvent(new CustomEvent("liotan:mls-conversation-unavailable", {
        detail: { chatKey: key, conversationId: state?.conversationId || "" }
      }));
      throw error;
    }).finally(() => this.ensuring.delete(key));
    this.ensuring.set(key, promise);
    return promise;
  }

  async cacheEnvelope(state, sequence, envelope) {
    const record = {
      sequence,
      envelope,
      ...(envelope.kind === "message" ? {
        mutationState: initialMessageMutationState(envelope),
        materialized: { text: envelope.text, deleted: false }
      } : {})
    };
    await putEncryptedHistoryRecord({
      conversationId: state.conversationId,
      sequence,
      clientMessageId: envelope.clientMessageId
    }, record, this.keys.cacheKey);
  }

  async acceptMessageMutation(state, event, envelope, { requireV2 = true } = {}) {
    const targetRecord = await this.findCachedEnvelope(state.conversationId, envelope.targetMessageId);
    const updatedTarget = applyMessageMutation(targetRecord, envelope, { requireV2 });
    await putEncryptedHistoryRecords([
      {
        meta: {
          conversationId: state.conversationId,
          sequence: event.sequence,
          clientMessageId: envelope.clientMessageId
        },
        value: { sequence: event.sequence, envelope }
      },
      {
        meta: {
          conversationId: state.conversationId,
          sequence: targetRecord.sequence,
          clientMessageId: targetRecord.envelope.clientMessageId
        },
        value: updatedTarget
      }
    ], this.keys.cacheKey);
    if (updatedTarget.mutationState.deleted) {
      const offlineKeys = this.attachmentOfflineKeys(
        this.envelopeToUiMessage(state, targetRecord.envelope).attachment
      );
      if (offlineKeys.length) await deleteOfflineBlobs(offlineKeys);
    }
    return updatedTarget.mutationState;
  }

  syncCheckpointKey(conversationId) {
    return `sync-checkpoint:${conversationId}:${this.clientIdString}`;
  }

  async writeSyncCheckpoint(state, processedSequence, serverHead = processedSequence) {
    const sequence = Math.max(0, Number(processedSequence) || 0);
    const head = Math.max(sequence, Number(serverHead) || 0);
    await putEncryptedRecord(this.syncCheckpointKey(state.conversationId), {
      v: 1,
      conversationId: state.conversationId,
      clientId: this.clientIdString,
      processedSequence: sequence,
      serverHead: head,
      rosterVersion: Number(state.rosterVersion || 0),
      updatedAt: new Date().toISOString()
    }, this.keys.cacheKey);
    localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(sequence));
  }

  async readSyncCheckpoint(state) {
    const record = await getEncryptedRecord(
      this.syncCheckpointKey(state.conversationId),
      this.keys.cacheKey
    );
    const valid = record?.v === 1 &&
      record.conversationId === state.conversationId &&
      record.clientId === this.clientIdString &&
      Number.isSafeInteger(Number(record.processedSequence)) &&
      Number(record.processedSequence) >= 0;
    if (valid) return record;

    // One-time migration: derive the restart point only from authenticated,
    // encrypted history. localStorage is deliberately treated as an
    // untrusted display hint and can never advance the cryptographic cursor.
    const migration = this.historyMigrations.get(state.conversationId);
    if (migration) await migration;
    const latest = await listEncryptedHistoryRecords(
      state.conversationId,
      this.keys.cacheKey,
      { limit: 1 }
    );
    const processedSequence = Math.max(0, Number(latest[0]?.sequence) || 0);
    const migrated = {
      v: 1,
      conversationId: state.conversationId,
      clientId: this.clientIdString,
      processedSequence,
      serverHead: processedSequence,
      rosterVersion: Number(state.rosterVersion || 0),
      migratedFromLegacyHint: true
    };
    await putEncryptedRecord(
      this.syncCheckpointKey(state.conversationId),
      migrated,
      this.keys.cacheKey
    );
    localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(processedSequence));
    return migrated;
  }

  dispatchCachedEnvelope(state, event, envelope) {
    if (envelope.kind === "message") {
      dispatchCryptoMessage({
        type: "message",
        message: this.envelopeToUiMessage(state, envelope, event.createdAt, event.sequence)
      });
      return;
    }
    dispatchCryptoMessage({
      type: envelope.kind,
      chatId: this.envelopeToUiMessage(
        state,
        { ...envelope, attachment: null },
        event.createdAt,
        event.sequence
      ).chatId,
      messageId: envelope.targetMessageId,
      text: envelope.text || "",
      from: envelope.senderUsername,
      ...mutationUiMetadata(envelope)
    });
  }

  findCachedEnvelope(conversationId, clientMessageId) {
    return getEncryptedHistoryRecord(conversationId, clientMessageId, this.keys.cacheKey)
      .then(record => record || getEncryptedRecord(
        `message:${conversationId}:${clientMessageId}`,
        this.keys.cacheKey
      ));
  }

  startHistoryMigration(state) {
    if (this.historyMigrations.has(state.conversationId)) {
      return this.historyMigrations.get(state.conversationId);
    }
    const migration = migrateEncryptedHistoryRecords(state.conversationId, this.keys.cacheKey, {
      batchSize: 128,
      shouldContinue: () => !this.closing && !this.purgingConversations.has(state.conversationId)
    }).then(result => {
      if (result.completed && result.latest.length) {
        this.dispatchHistoryRecords(state, result.latest, "initial");
      }
      return result;
    }).catch(error => {
      if (import.meta.env.DEV) console.warn("Encrypted MLS history migration failed", error);
      return { completed: false, written: 0, latest: [] };
    }).finally(() => {
      this.historyMigrations.delete(state.conversationId);
    });
    this.historyMigrations.set(state.conversationId, migration);
    return migration;
  }

  async loadCachedHistory(state) {
    if (loadedHistory.has(state.conversationId)) return;
    try {
      await this.hiddenMessages(state.conversationId);
      const records = await listEncryptedHistoryRecords(state.conversationId, this.keys.cacheKey, {
        limit: INITIAL_HISTORY_LIMIT
      });
      this.dispatchHistoryRecords(state, records, "initial");
      loadedHistory.add(state.conversationId);
      this.startHistoryMigration(state);
    } catch (error) {
      loadedHistory.delete(state.conversationId);
      throw error;
    }
  }

  dispatchHistoryRecords(state, records, direction = "initial") {
    const messages = [];
    const controls = [];
    const hidden = hiddenMessagesByConversation.get(state.conversationId) || new Set();
    for (const record of records) {
      const envelope = record?.envelope;
      if (!envelope) continue;
      if (hidden.has(String(envelope.clientMessageId)) || hidden.has(String(envelope.targetMessageId))) continue;
      if (envelope.kind === "message") {
        if (record.materialized?.deleted || record.mutationState?.deleted) continue;
        const message = this.envelopeToUiMessage(
          state,
          { ...envelope, text: record.materialized?.text ?? envelope.text },
          "",
          record.sequence
        );
        message.mls = {
          ...message.mls,
          mutationRevision: Number(record.mutationState?.revision || 0),
          lastMutationId: String(record.mutationState?.lastMutationId || envelope.clientMessageId)
        };
        messages.push(message);
      } else {
        if (envelope.mutation?.v === 2) continue;
        controls.push({
          type: envelope.kind,
          chatId: this.envelopeToUiMessage(state, { ...envelope, attachment: null }, "", record.sequence).chatId,
          messageId: envelope.targetMessageId,
          text: envelope.text || "",
          from: envelope.senderUsername
        });
      }
    }
    if (messages.length) {
      dispatchCryptoMessage({ type: "history-page", direction, messages });
    }
    controls.forEach(dispatchCryptoMessage);
  }

  async loadOlderHistory(chatKey, beforeSequence, limit = INITIAL_HISTORY_LIMIT) {
    const state = conversationByChat.get(String(chatKey)) || await this.ensureConversation(chatKey);
    const migration = this.historyMigrations.get(state.conversationId);
    if (migration) await migration;
    const records = await listEncryptedHistoryRecords(state.conversationId, this.keys.cacheKey, {
      beforeSequence: Number(beforeSequence),
      limit
    });
    this.dispatchHistoryRecords(state, records, "older");
    return { loaded: records.length, hasMore: records.length >= limit };
  }

  async loadNewerHistory(chatKey, afterSequence, limit = INITIAL_HISTORY_LIMIT) {
    const state = conversationByChat.get(String(chatKey)) || await this.ensureConversation(chatKey);
    const records = await listEncryptedHistoryRecords(state.conversationId, this.keys.cacheKey, {
      afterSequence: Number(afterSequence),
      limit
    });
    this.dispatchHistoryRecords(state, records, "newer");
    const latestSequence = Number(localStorage.getItem(`liotan:mls-sequence:${state.conversationId}`) || 0);
    const loadedThrough = records.length ? Number(records[records.length - 1]?.sequence || 0) : Number(afterSequence || 0);
    return { loaded: records.length, hasMore: loadedThrough < latestSequence };
  }

  envelopeToUiMessage(state, envelope, eventCreatedAt = "", sequence = 0) {
    const message = envelopeToUiMessage(state, envelope, this.username, eventCreatedAt);
    return {
      ...message,
      mls: {
        ...message.mls,
        sequence: Number(sequence) || 0
      }
    };
  }

  transparencyGossip(state) {
    const checkpoints = Object.values(state?.trustStates || {})
      .map(item => item?.transparencyCheckpoint)
      .filter(Boolean)
      .sort((left, right) =>
        Number(right.checkpoint?.treeSize || 0) - Number(left.checkpoint?.treeSize || 0)
      );
    return checkpoints[0] || null;
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
      await observeTransparencyGossip(this, envelope.transparencyCheckpoint);
      const hidden = await this.hiddenMessages(state.conversationId);
      const isHidden = hidden.has(String(envelope.clientMessageId)) || hidden.has(String(envelope.targetMessageId));
      if (isHidden) return;
      let mutationState = null;
      if (["edit", "delete"].includes(envelope.kind)) {
        const cutoff = Number(state.legacyMutationCutoffSequence || 0);
        mutationState = await this.acceptMessageMutation(state, event, envelope, {
          requireV2: Number(event.sequence) > cutoff
        });
      } else {
        try {
          await this.cacheEnvelope(state, event.sequence, envelope);
        } catch (error) {
          if (import.meta.env.DEV) console.warn("MLS local cache write failed", error);
        }
      }
      if (envelope.kind === "message") {
        dispatchCryptoMessage({ type: "message", message: this.envelopeToUiMessage(state, envelope, event.createdAt, event.sequence) });
      } else {
        dispatchCryptoMessage({
          type: envelope.kind,
          chatId: this.envelopeToUiMessage(state, { ...envelope, attachment: null }, event.createdAt, event.sequence).chatId,
          messageId: envelope.targetMessageId,
          text: envelope.text || "",
          from: envelope.senderUsername,
          mutationRevision: Number(mutationState?.revision || 0),
          lastMutationId: String(mutationState?.lastMutationId || "")
        });
      }
    } finally {
      destroyUniffi(decrypted.senderClientId);
    }
  }

  async syncConversation(state) {
    if (this.syncing.has(state.conversationId)) return this.syncing.get(state.conversationId);
    const promise = (async () => {
      let checkpoint = await this.readSyncCheckpoint(state);
      const localHint = Number(localStorage.getItem(`liotan:mls-sequence:${state.conversationId}`) || 0);
      let after = reconcileSyncCursor({ checkpoint, localHint }).after;
      localStorage.setItem(`liotan:mls-sequence:${state.conversationId}`, String(after));
      while (true) {
        if (this.purgingConversations.has(state.conversationId)) return;
        const path = `/crypto/v4/conversations/${encodeURIComponent(state.conversationId)}/events?after=${after}&limit=100`;
        let response;
        try {
          response = await signedCryptoRequest(path);
        } catch (err) {
          if (err.status === 403 && !state.initialized) return;
          if (err.status === 403) {
            state.ready = false;
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
        const recipientHead = Math.max(0, Number(response.recipientHead) || 0);
        state.sequence = Math.max(Number(state.sequence) || 0, Number(response.conversation?.sequence) || recipientHead);
        state.legacyMutationCutoffSequence = Number(
          response.conversation?.legacyMutationCutoffSequence ?? state.legacyMutationCutoffSequence ?? 0
        );
        try {
          reconcileSyncCursor({ checkpoint, localHint: after, recipientHead });
          validateRecipientEventPage({ after, recipientHead, events: response.events });
        } catch (error) {
          reportCryptoDiagnostic(error, { stage: "conversation-sync" });
          state.ready = false;
          throw error;
        }
        for (const event of response.events) {
          if (this.purgingConversations.has(state.conversationId)) return;
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
                const bufferedMessages = result.bufferedMessages || [];
                if (bufferedMessages.length) {
                  for (const buffered of bufferedMessages) destroyUniffi(buffered.senderClientId);
                  const error = new Error("MLS returned messages without authenticated server event metadata");
                  error.code = "mls-buffered-metadata-unavailable";
                  reportCryptoDiagnostic(error, { stage: "conversation-sync" });
                  throw error;
                }
              }
            } else if (event.kind === "message") {
              const cachedRecord = await this.findCachedEnvelope(state.conversationId, event.clientMessageId);
              const cached = cachedRecord?.envelope;
              if (cached) {
                const hidden = await this.hiddenMessages(state.conversationId);
                if (!hidden.has(String(cached.clientMessageId)) && !hidden.has(String(cached.targetMessageId))) {
                  this.dispatchCachedEnvelope(state, event, cached);
                }
              } else if (event.senderClientId === this.clientIdString) {
                const error = new Error("An acknowledged local MLS message is missing from encrypted history");
                error.code = "mls-local-history-gap";
                reportCryptoDiagnostic(error, { stage: "conversation-sync" });
              } else {
                const decrypted = await this.core.transaction(ctx => ctx.decryptMessage(conversationId, base64UrlToBytes(event.ciphertext)));
                await this.handleApplicationMessage(state, event, decrypted);
              }
            }
          } finally {
            destroyUniffi(conversationId);
          }
          after = event.sequence;
          await this.writeSyncCheckpoint(state, after, recipientHead);
          checkpoint = {
            ...checkpoint,
            processedSequence: after,
            serverHead: recipientHead
          };
        }
        if (!response.events.length) {
          await this.writeSyncCheckpoint(state, after, recipientHead);
          checkpoint = { ...checkpoint, serverHead: recipientHead };
        }
        if (!response.hasMore) break;
      }
      state.lastSyncedAt = Date.now();
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
    if (state) {
      state.ready = false;
      await this.ensureConversation(state.chatKey, state.dialog, { forceDirectory: true });
    }
  }

  async syncAll() {
    await this.syncInvalidations();
    for (const state of conversationById.values()) await this.syncConversation(state);
  }

  async prepareDialogs(dialogs = []) {
    // Resolve only a tiny preview window. Preparing every dialog used to run
    // full MLS reconciliation for up to 50 chats during startup and competed
    // with the conversation the user was actually opening.
    for (const dialog of dialogs) {
      const chatKey = dialog.chatKey || dialog.username || (dialog.groupId ? `group:${dialog.groupId}` : "");
      if (!chatKey) continue;
      this.maintenanceQueue.set(String(chatKey), {
        chatKey: String(chatKey),
        dialog,
        failures: 0,
        retryAfter: 0
      });
    }
    for (const dialog of dialogs.slice(0, 3)) {
      const chatKey = dialog.chatKey || dialog.username || (dialog.groupId ? `group:${dialog.groupId}` : "");
      if (!chatKey) continue;
      try {
        await this.resolveConversation(chatKey, dialog);
      } catch (err) {
        if (import.meta.env.DEV) console.warn("MLS dialog sync failed", chatKey, err);
      }
    }
    this.maintainNextDialog().catch(error => {
      if (import.meta.env.DEV) console.warn("Initial MLS background maintenance failed", error);
    });
  }

  async maintainNextDialog() {
    if (this.closing || document.visibilityState === "hidden" || navigator.onLine === false) return;
    const now = Date.now();
    const candidate = [...this.maintenanceQueue.values()]
      .find(item => Number(item.retryAfter || 0) <= now && !this.ensuring.has(item.chatKey));
    if (!candidate) return;
    this.maintenanceQueue.delete(candidate.chatKey);
    try {
      await this.ensureConversation(candidate.chatKey, candidate.dialog);
      candidate.failures = 0;
      candidate.retryAfter = now + SELF_UPDATE_INTERVAL_MS;
    } catch (error) {
      candidate.failures = Math.min(8, Number(candidate.failures || 0) + 1);
      candidate.retryAfter = now + Math.min(
        SELF_UPDATE_INTERVAL_MS,
        BACKGROUND_MAINTENANCE_INTERVAL_MS * (2 ** candidate.failures)
      );
      throw error;
    } finally {
      this.maintenanceQueue.set(candidate.chatKey, candidate);
    }
  }

  async encryptAndUploadMedia(state, file, clientMessageId, options = {}) {
    return encryptAndUploadMedia(state, file, clientMessageId, options);
  }

  async enqueueEnvelope(state, envelope, transport = {}) {
    const key = state.conversationId;
    const previous = this.sendQueues.get(key) || Promise.resolve();
    const queued = previous.catch(() => {}).then(() => this.sendEnvelope(state, envelope, transport));
    this.sendQueues.set(key, queued);
    try {
      return await queued;
    } finally {
      if (this.sendQueues.get(key) === queued) this.sendQueues.delete(key);
    }
  }

  async sendEnvelope(state, envelope, transport = {}) {
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
          ciphertext: bytesToBase64Url(ciphertext),
          ...(transport.attachmentCommit ? { attachmentCommit: transport.attachmentCommit } : {}),
          ...(transport.attachmentDelete ? {
            attachmentDelete: transport.attachmentDelete,
            attachmentDeleteBaseSequence: transport.attachmentDeleteBaseSequence
          } : {})
        }
      }
    );
    state.sequence = Math.max(Number(state.sequence) || 0, Number(response.sequence) || 0);
    try {
      if (!transport.deferLocalMutation) {
        await this.cacheEnvelope(state, response.sequence, envelope);
      }
    } catch (error) {
      // Delivery already committed. Never retry as a second message merely
      // because the encrypted local cache is full/unavailable.
      if (import.meta.env.DEV) console.warn("MLS local cache write failed", error);
    }
    return response;
  }

  async sendMessage({ chatKey, dialog, text = "", file = null, mediaOptions = {}, replyTo = null, clientMessageId = "" }) {
    const state = await this.ensureConversation(chatKey, dialog);
    const messageId = clientMessageId || crypto.randomUUID();
    const uploadedMedia = file
      ? await this.encryptAndUploadMedia(state, file, messageId, mediaOptions)
      : null;
    const attachment = uploadedMedia?.descriptor || null;
    const envelope = {
      v: 1,
      kind: "message",
      conversationId: state.conversationId,
      clientMessageId: messageId,
      senderUsername: this.username,
      senderClientId: this.clientIdString,
      sentAt: new Date().toISOString(),
      transparencyCheckpoint: this.transparencyGossip(state),
      text: String(text || "").slice(0, 20000),
      attachment,
      replyTo: replyTo ? { messageId: String(replyTo._id || replyTo.messageId || "") } : null
    };
    const response = await this.enqueueEnvelope(state, envelope, {
      attachmentCommit: uploadedMedia?.commit || null
    });
    const message = this.envelopeToUiMessage(state, envelope, new Date().toISOString(), response.sequence);
    dispatchCryptoMessage({ type: "message", message });
    return { ok: true, response, message };
  }

  async sendControl({ chatKey, dialog, kind, targetMessageId, text = "", attachmentDelete = null }) {
    if (!["edit", "delete", "pin"].includes(kind)) throw new Error("Invalid MLS control event");
    const state = await this.ensureConversation(chatKey, dialog);
    if (["edit", "delete"].includes(kind)) {
      const mutationKey = `${state.conversationId}:${String(targetMessageId || "")}`;
      const previous = this.mutationQueues.get(mutationKey) || Promise.resolve();
      const queued = previous.catch(() => {}).then(async () => {
        await this.syncConversation(state);
        const targetRecord = await this.findCachedEnvelope(state.conversationId, targetMessageId);
        const target = targetRecord?.envelope;
        if (!target || target.kind !== "message" || target.senderUsername !== this.username) {
          throw new Error("Only the authenticated sender can mutate this MLS message");
        }
        const envelope = {
          v: 1,
          kind,
          conversationId: state.conversationId,
          clientMessageId: crypto.randomUUID(),
          senderUsername: this.username,
          senderClientId: this.clientIdString,
          sentAt: new Date().toISOString(),
          transparencyCheckpoint: this.transparencyGossip(state),
          targetMessageId: String(targetMessageId || ""),
          text: kind === "edit" ? String(text || "").slice(0, 20000) : "",
          mutation: nextMutationBinding(target, targetRecord.mutationState)
        };
        const response = await this.enqueueEnvelope(state, envelope, {
          attachmentDelete: kind === "delete" ? attachmentDelete : null,
          attachmentDeleteBaseSequence: Number(state.sequence) || 0,
          deferLocalMutation: true
        });
        const mutationState = await this.acceptMessageMutation(state, response, envelope, { requireV2: true });
        dispatchCryptoMessage({
          type: kind,
          chatId: this.envelopeToUiMessage(state, { ...envelope, attachment: null }).chatId,
          messageId: envelope.targetMessageId,
          text: envelope.text,
          from: this.username,
          mutationRevision: mutationState.revision,
          lastMutationId: mutationState.lastMutationId
        });
        return { ok: true };
      });
      this.mutationQueues.set(mutationKey, queued);
      try {
        return await queued;
      } finally {
        if (this.mutationQueues.get(mutationKey) === queued) this.mutationQueues.delete(mutationKey);
      }
    }
    const envelope = {
      v: 1,
      kind,
      conversationId: state.conversationId,
      clientMessageId: crypto.randomUUID(),
      senderUsername: this.username,
      senderClientId: this.clientIdString,
      sentAt: new Date().toISOString(),
      transparencyCheckpoint: this.transparencyGossip(state),
      targetMessageId: String(targetMessageId || ""),
      text: kind === "edit" ? String(text || "").slice(0, 20000) : ""
    };
    await this.enqueueEnvelope(state, envelope, {
      attachmentDelete: kind === "delete" ? attachmentDelete : null
    });
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
  const wiped = new Set();
  for (const value of [
    keys.rootSecretKey,
    keys.requestSecretKey,
    keys.legacyRequestSecretKey,
    keys.localRequestSecretKey,
    keys.databaseKey,
    keys.cacheKey
  ]) {
    if (value && !wiped.has(value)) {
      wiped.add(value);
      wipe(value);
    }
  }
}

async function deriveKeysForBootstrap({ username, recoveryKey, bootstrap, deviceId }) {
  const deviceRequestSecretKey = await loadOrCreateDeviceRequestSecret(username, deviceId);
  try {
    const authVersion = bootstrap.device
      ? Number(bootstrap.device.authVersion) || 1
      : 2;
    return await deriveAccountKeys(
      recoveryKey,
      bootstrap.identity.cryptoUserId,
      deviceId,
      { deviceRequestSecretKey, authVersion }
    );
  } finally {
    wipe(deviceRequestSecretKey);
  }
}

async function createInitializedEngine({ username, recoveryKey, generation }) {
  const deviceId = getOrCreateDeviceId(username);
  const bootstrap = await cryptoBootstrap(deviceId);
  const keys = await deriveKeysForBootstrap({ username, recoveryKey, bootstrap, deviceId });
  let next = new LiotanMlsEngine({ username, bootstrap, deviceId, keys });
  let automaticRepairAttempted = false;
  try {
    try {
      await next.initialize();
    } catch (firstError) {
      const failedStage = next.initializationStage;
      await next.closeDatabase();
      if (["mls-device-approval-required", "mls-recovery-bootstrap-required", "mls-device-inactive"]
        .includes(firstError?.code)) {
        throw firstError;
      }
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

export async function confirmPendingRecoveryDevice({
  username,
  recoveryKey,
  allowActiveDevices = false
}) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername || !recoveryKey) throw new TypeError("Recovery key is required");
  if (engine || engineInitialization) throw new Error("Close the active MLS session before recovery bootstrap");
  const deviceId = getOrCreateDeviceId(cleanUsername);
  const bootstrap = await cryptoBootstrap(deviceId);
  const keys = await deriveKeysForBootstrap({
    username: cleanUsername,
    recoveryKey,
    bootstrap,
    deviceId
  });
  try {
    const derivedRoot = bytesToBase64Url(keys.rootPublicKey);
    if (!bootstrap.identity.rootPublicKey ||
      !constantTimeTextEqual(bootstrap.identity.rootPublicKey, derivedRoot)) {
      throw new Error("Recovery key does not match the account identity");
    }
    const target = bootstrap.device;
    const recoveryEnrollment = Number(target?.authVersion) === 2 &&
      (target?.activationMode === "recovery-bootstrap" ||
        (allowActiveDevices && target?.activationMode === "device-approval"));
    if (!target || target.status !== "pending" ||
      (!recoveryEnrollment && target.activationMode !== "recovery-bootstrap")) {
      throw new Error("No pending device is available for explicit recovery enrollment");
    }
    const temporaryEngine = {
      username: cleanUsername,
      bootstrap,
      keys
    };
    await verifyAndPinAccountDirectory(temporaryEngine, {
      username: cleanUsername,
      identity: bootstrap.identity,
      deviceCommitments: bootstrap.deviceCommitments || [],
      allDevices: bootstrap.accountDevices || []
    });
    const confirmation = recoveryEnrollment
      ? {
          v: 2,
          action: "recover-enroll-device",
          protocol: "liotan-device-auth-v2",
          cryptoUserId: bootstrap.identity.cryptoUserId,
          deviceId: target.deviceId,
          clientId: target.clientId,
          requestPublicKey: target.requestPublicKey,
          sessionBindingId: bootstrap.sessionBindingId,
          challenge: target.approvalChallenge,
          preserveExistingDevices: true,
          visibleSecurityEventAcknowledged: true,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          nonce: randomId(24)
        }
      : {
          v: 1,
          cryptoUserId: bootstrap.identity.cryptoUserId,
          deviceId: target.deviceId,
          clientId: target.clientId,
          challenge: target.approvalChallenge,
          warningAcknowledged: true,
          timestamp: new Date().toISOString(),
          nonce: randomId(24)
        };
    const confirmationSignature = await signCanonical(
      keys.rootSecretKey,
      recoveryEnrollment
        ? "liotan-recovery-enrollment-v2"
        : "liotan-recovery-bootstrap-v1",
      confirmation
    );
    const nextDevice = {
      ...target,
      status: "active",
      approval: confirmation,
      approvalSignature: confirmationSignature,
      activationMode: recoveryEnrollment ? "recovery-enrollment" : target.activationMode,
      approvedByClientId: recoveryEnrollment ? "recovery-enrollment" : "recovery-bootstrap",
      approvalChallenge: ""
    };
    const directory = await buildDirectoryMutation(temporaryEngine, {
      devices: bootstrap.accountDevices || [],
      nextDevice,
      action: recoveryEnrollment ? "recovery-enrollment" : "recovery-bootstrap",
      targetDeviceId: target.deviceId
    });
    return await unsignedCryptoPost(
      `/crypto/v4/devices/${encodeURIComponent(target.deviceId)}/${
        recoveryEnrollment ? "recovery-enrollment" : "recovery-bootstrap"
      }`,
      {
        confirmation,
        confirmationSignature,
        directoryUpdate: directory.statement,
        directorySignature: directory.signature
      }
    );
  } finally {
    wipeEngineKeys(keys);
  }
}

export async function reprovisionMlsDevice({ username, recoveryKey }) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername || !recoveryKey) throw new TypeError("Recovery key is required for device recovery");
  if (engine || engineInitialization) throw new Error("Close the active MLS session before device recovery");

  const oldDeviceId = getOrCreateDeviceId(cleanUsername);
  const bootstrap = await cryptoBootstrap(oldDeviceId);
  const keys = await deriveKeysForBootstrap({
    username: cleanUsername,
    recoveryKey,
    bootstrap,
    deviceId: oldDeviceId
  });
  try {
    const derivedRoot = bytesToBase64Url(keys.rootPublicKey);
    if (!bootstrap.identity.rootPublicKey || !constantTimeTextEqual(bootstrap.identity.rootPublicKey, derivedRoot)) {
      throw new Error("Recovery key does not match the account identity");
    }
    if (bootstrap.device?.status === "active") {
      configureCryptoSigner({
        deviceId: oldDeviceId,
        requestSecretKey: keys.requestSecretKey,
        authVersion: Number(bootstrap.device.authVersion) || 1,
        sessionBindingId: bootstrap.sessionBindingId
      });
      const temporaryEngine = { username: cleanUsername, bootstrap, keys };
      await verifyAndPinAccountDirectory(temporaryEngine, {
        username: cleanUsername,
        identity: bootstrap.identity,
        deviceCommitments: bootstrap.deviceCommitments || [],
        allDevices: bootstrap.accountDevices || []
      });
      const revocation = {
        cryptoUserId: bootstrap.identity.cryptoUserId,
        deviceId: oldDeviceId,
        revokedAt: new Date().toISOString(),
        nonce: randomId(24),
        recoveryAcknowledged: true,
        reprovisionSession: true
      };
      const signature = await signCanonical(keys.rootSecretKey, "liotan-device-revocation-v1", revocation);
      const nextDevice = {
        ...bootstrap.device,
        status: "revoked",
        revokedAt: revocation.revokedAt,
        revocation,
        revocationSignature: signature
      };
      const directory = await buildDirectoryMutation(temporaryEngine, {
        devices: bootstrap.accountDevices || [],
        nextDevice,
        action: "revoke-device",
        targetDeviceId: oldDeviceId
      });
      await signedCryptoRequest(`/crypto/v4/devices/${encodeURIComponent(oldDeviceId)}/revoke`, {
        method: "POST",
        body: {
          revocation,
          signature,
          directoryUpdate: directory.statement,
          directorySignature: directory.signature
        }
      });
    }
    configureCryptoSigner(null);
    await deleteCoreCryptoDatabase(getCoreCryptoDatabaseName(bootstrap.identity.cryptoUserId, oldDeviceId));
    await deleteDeviceRequestSecret(cleanUsername, oldDeviceId);
    removeDeviceId(cleanUsername, oldDeviceId);
  } finally {
    configureCryptoSigner(null);
    wipeEngineKeys(keys);
  }
  try {
    return await initializeMlsEngine({ username: cleanUsername, recoveryKey });
  } catch (error) {
    if (error?.code !== "mls-recovery-bootstrap-required") throw error;
    await confirmPendingRecoveryDevice({ username: cleanUsername, recoveryKey });
    return initializeMlsEngine({ username: cleanUsername, recoveryKey });
  }
}

export function getMlsEngine() {
  if (!engine) throw new Error("End-to-end encryption is locked");
  return engine;
}

export function getConversationSecurityInfo(chatKey) {
  const state = conversationByChat.get(String(chatKey || ""));
  if (!state?.ready || !state.initialized || state.blockedForEpochChange || !state.directory?.length) return null;
  const roots = state.directory
    .map(user => ({
      username: user.username,
      rootFingerprint: user.identity?.rootFingerprint || "",
      directoryHash: user.identity?.directory?.hash || "",
      directoryVersion: Number(user.identity?.directory?.version || 0),
      trustStatus: state.trustStates?.[user.username]?.status || "first-seen",
      verifiedAt: state.trustStates?.[user.username]?.verifiedAt || null
    }))
    .sort((left, right) => left.username.localeCompare(right.username));
  if (roots.some(item => !item.rootFingerprint || !item.directoryHash)) return null;
  const computed = computeSafetyNumber(roots);
  if (!computed) return null;
  const statuses = roots.map(item => item.trustStatus);
  const verificationStatus = statuses.includes("changed")
    ? "changed"
    : statuses.every(status => status === "verified")
      ? "verified"
      : statuses.every(status => status === "first-seen") ? "first-seen" : "unverified";
  return {
    protocol: "MLS 1.0 (RFC 9420)",
    conversationId: state.conversationId,
    fingerprint: computed.fingerprint,
    formatted: computed.formatted,
    participants: roots,
    verificationStatus,
    qrPayload: computed.qrPayload
  };
}

export function computeSafetyNumber(participants) {
  const binding = (participants || []).map(item => ({
    username: String(item.username || ""),
    rootFingerprint: String(item.rootFingerprint || ""),
    directoryHash: String(item.directoryHash || ""),
    directoryVersion: Number(item.directoryVersion || 0)
  })).sort((left, right) => left.username.localeCompare(right.username));
  if (!binding.length || binding.some(item => !item.username || !item.rootFingerprint || !item.directoryHash)) {
    return null;
  }
  const fingerprint = sha256Base64Url(canonicalJson(["liotan-safety-number-v2", binding]));
  const decimal = BigInt(`0x${bytesToHex(base64UrlToBytes(fingerprint, 32))}`).toString(10).padStart(78, "0");
  return {
    fingerprint,
    formatted: decimal.match(/.{1,6}/g)?.join(" ") || decimal,
    qrPayload: `liotan-safety:v2:${fingerprint}`
  };
}

export async function markConversationSafetyVerified(chatKey) {
  return getMlsEngine().markConversationSafetyVerified(chatKey);
}

export async function resetMlsEngine() {
  engineGeneration += 1;
  const pending = engineInitialization;
  if (pending) await pending.catch(() => {});
  const current = engine;
  engine = null;
  if (current) {
    current.closing = true;
    await Promise.allSettled(current.historyMigrations.values());
    await current.closeDatabase();
    current.sendQueues.clear();
    current.historyMigrations.clear();
    wipeEngineKeys(current.keys);
  }
  configureCryptoSigner(null);
  conversationByChat.clear();
  conversationById.clear();
  loadedHistory.clear();
  hiddenMessagesByConversation.clear();
}

export async function purgeDeletedAccountLocalState(username) {
  const current = engine;
  const cryptoUserId = String(current?.bootstrap?.identity?.cryptoUserId || "").toLowerCase();
  const databaseNames = new Set(current?.databaseName ? [current.databaseName] : []);
  if (cryptoUserId && typeof indexedDB.databases === "function") {
    const databases = await indexedDB.databases();
    databases.forEach(database => {
      if (String(database.name || "").startsWith(`liotan-mls-${cryptoUserId}-`)) databaseNames.add(database.name);
    });
  }
  await resetMlsEngine();
  const results = await Promise.allSettled([
    ...[...databaseNames].map(name => deleteCoreCryptoDatabase(name)),
    deleteLocalCryptoStore(),
    clearOfflineMedia()
  ]);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index) || "";
    if (key.startsWith("liotan:mls-sequence:") ||
      key === deviceIdRecordName(username) ||
      key === `liotan:last-chat:${encodeURIComponent(username)}` ||
      key === "liotan-open-totp-setup") {
      localStorage.removeItem(key);
    }
  }
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) {
    const error = new Error("Deleted account data is blocked by another browser tab; close it and retry local cleanup");
    error.causes = failures.map(item => item.reason);
    throw error;
  }
}

export { decryptMlsMediaBlob, downloadMlsCiphertext };
