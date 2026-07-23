# Full changed-files review

## Review method

The code-complete checkpoint is `ff13e65`, compared with audited/base commit
`558d948`. At that checkpoint:

- 147 tracked files differ;
- every JavaScript/JSX/MJS production module is parsed into the relative-import
  graph;
- explicit roots are the client entry, server entry and every operational
  `server/scripts` entry;
- all 297 production modules are reachable from the 21 roots;
- `durableMigration.js` is reachable from operational migration roots;
- every deletion is locked by regression/import-graph evidence;
- evidence documents in this directory are reviewed separately and are not
  production/runtime inputs.

The canonical review command is:

```text
git diff --name-status 558d9484a4c72885ed2332471f8672736cd141d2..ff13e65
```

## Risk-focused review

| Area | Review conclusion |
|---|---|
| Workflows/release | Permissions, action pins, source SHA, manifests, reproducibility, attestations and installer argument handling are gated. |
| Client crypto | Device/recovery separation, directory proof continuity and message mutation chain are versioned and fail closed. |
| Server auth/API/socket | JWT expiry, session/device binding, proxy trust, pre-body authorization, query/property validation and tombstones are covered by adversarial tests. |
| Media/avatar/storage | Durable reservations/lifecycle, actual-byte accounting, managed temp handles, R2 separation, avatar CAS and aggregate-only audits are enforced. |
| Migrations | Additive migrations are leased, checkpointed, resumable, dry-run/inspect first and exact-confirmed for apply. Destructive legacy retirement is outside automatic deployment. |
| Deletions | Removed files were either legacy paths replaced by tombstones/current Crypto v4, misleading unavailable call/security foundations, duplicate message renderers, or helpers transitively unreachable from supported roots. |
| Tests/evidence | New unit/integration/browser/static gates reproduce the findings and lock the fixed invariants. |

## Complete source change manifest

`A`, `M`, and `D` mean added, modified, and deleted.

```text
M  .github/workflows/ci.yml
M  .github/workflows/codeql.yml
M  .github/workflows/deploy-vps.yml
M  SECURITY.md
M  client/.env.example
D  client/src/components/chat/message/MessagePhoto.jsx
D  client/src/components/chat/message/MessageVideo.jsx
M  client/src/components/settings/pages/DevicesPage.jsx
M  client/src/crypto/CryptoGate.jsx
M  client/src/crypto/accountKeys.jsx
M  client/src/crypto/cryptoApi.jsx
M  client/src/crypto/mls/envelope.jsx
M  client/src/crypto/mls/identity.jsx
A  client/src/crypto/mls/messageMutations.mjs
A  client/src/crypto/mls/transparency.jsx
M  client/src/crypto/mls/trust.jsx
M  client/src/crypto/mlsEngine.jsx
M  client/src/crypto/recoveryStore.jsx
M  client/src/hooks/useSocket.jsx
D  client/src/security/recovery/recoveryFoundation.jsx
D  client/src/security/totp/totpFoundation.jsx
D  client/src/security/trust/deviceTrustFoundation.jsx
D  client/src/security/vault/vaultFoundation.jsx
M  client/src/services/api.jsx
D  client/src/services/callSecurity.jsx
D  client/src/services/realtimeCapabilities.jsx
D  client/src/services/secureCallFrames.jsx
D  client/src/services/secureVoice.jsx
M  client/src/utils/chatState.jsx
M  client/test/browser/mls-core.spec.js
M  client/test/production/fixture.jsx
M  client/vite.config.js
M  package-lock.json
M  package.json
M  scripts/checkRelease.js
A  scripts/codeHealthAudit.js
M  scripts/deployInstallerPreflightRegression.sh
M  scripts/deploymentBundleRegression.js
M  scripts/makeRelease.js
M  scripts/securityRegression.js
A  scripts/sourceRevision.js
A  scripts/workflowSecurityAudit.js
M  server/.env.example
M  server/app.js
M  server/config/attachmentUpload.js
M  server/config/env.js
A  server/config/proxyTrust.js
D  server/controllers/attachmentController.js
M  server/controllers/auth/emailCodeService.js
M  server/controllers/auth/securityPages.js
M  server/controllers/cryptoV4/conversations.js
M  server/controllers/cryptoV4/identityDevices.js
M  server/controllers/cryptoV4/media.js
M  server/controllers/cryptoV4/shared.js
A  server/controllers/cryptoV4/transparency.js
M  server/controllers/cryptoV4Controller.js
D  server/controllers/e2eeController.js
M  server/controllers/groupController.js
D  server/controllers/groupMessageController.js
M  server/controllers/profileController.js
M  server/deploy/install-release.sh
M  server/deploy/production-environment.example
A  server/middleware/avatarUploadGuard.js
M  server/middleware/contentSecurityPolicy.js
M  server/middleware/cryptoDeviceAuth.js
A  server/middleware/mediaAuthorization.js
M  server/middleware/mongoSanitize.js
M  server/middleware/uploadSecurity.js
M  server/models/AttachmentUpload.js
A  server/models/AvatarObject.js
A  server/models/AvatarUploadLease.js
M  server/models/CryptoConversation.js
M  server/models/CryptoDevice.js
A  server/models/CryptoDeviceSecurityEvent.js
A  server/models/CryptoTransparencyCheckpoint.js
A  server/models/CryptoTransparencyLeaf.js
A  server/models/CryptoTransparencyNode.js
A  server/models/CryptoTransparencyState.js
M  server/models/Group.js
A  server/models/LegacyRetirementObjectTask.js
A  server/models/MediaQuotaBucket.js
A  server/models/MediaQuotaState.js
A  server/models/MediaTransferReservation.js
M  server/models/User.js
M  server/package.json
M  server/routes/attachmentRoutes.js
M  server/routes/cryptoV4Routes.js
M  server/routes/groupMessageRoutes.js
M  server/routes/groupRoutes.js
M  server/routes/profileRoutes.js
D  server/routes/proxyRoutes.js
M  server/scripts/auditDataInventory.js
M  server/scripts/auditE2eeReplyPrivacy.js
A  server/scripts/auditR2OrphanCounts.js
M  server/scripts/auditVpsHardening.js
M  server/scripts/cleanupUploadsTask.js
A  server/scripts/migrateKeyTransparency.js
A  server/scripts/migrateMediaQuotaLifecycle.js
A  server/scripts/migrateMessageMutationProtocol.js
M  server/scripts/privacyAudit.js
A  server/scripts/reconcileAvatarStorage.js
A  server/scripts/reconcileMediaQuota.js
A  server/scripts/retireLegacyData.js
A  server/scripts/verifyProductionReadOnly.js
M  server/security/crypto/secureEnvelope.js
A  server/security/deviceAuthProtocol.js
A  server/security/keyTransparency.js
A  server/security/secretIsolation.js
M  server/security/startupSecurityValidation.js
D  server/services/attachmentAccess.js
M  server/services/attachmentOwnership.js
A  server/services/avatarLifecycle.js
M  server/services/deletionWorkflow.js
A  server/services/mediaQuota.js
A  server/services/mediaQuotaReconciliation.js
M  server/sockets/handlers/connectionHandlers.js
D  server/sockets/handlers/private/deleteMessage.js
D  server/sockets/handlers/private/deletePrivateChat.js
D  server/sockets/handlers/private/editMessage.js
D  server/sockets/handlers/private/markPrivateChatRead.js
D  server/sockets/handlers/private/pinMessage.js
D  server/sockets/services/buildReplyTo.js
D  server/sockets/services/deleteAttachmentFile.js
D  server/sockets/services/deleteMessageAttachments.js
D  server/sockets/services/emitToChatUsers.js
D  server/sockets/services/encryptedContent.js
D  server/sockets/services/markDeliveredForUser.js
D  server/sockets/services/mediaKeys.js
D  server/sockets/services/serializeMessage.js
M  server/sockets/socket.js
D  server/startup/ensureUploadDirs.js
M  server/test/integration/cryptoV4.integration.test.js
A  server/test/unit/messageMutations.test.js
A  server/test/unit/securityFoundations.test.js
A  server/test/unit/securityInputGuards.test.js
M  server/test/unit/startupSecurityValidation.test.js
D  server/utils/attachmentSecurity.js
M  server/utils/authCookie.js
M  server/utils/authToken.js
M  server/utils/avatarProcessing.js
M  server/utils/callPrivacy.js
M  server/utils/deleteUploadedFile.js
D  server/utils/messagePermissions.js
M  server/utils/privacy.js
M  server/utils/securityIds.js
M  server/utils/uploadToR2.js
M  server/utils/userRelations.js
```

## Deletion impact proof

The import-graph gate resolves supported relative imports and fails on missing
targets or a production module not reachable from a declared root. Security
regression also asserts each intentionally removed path remains absent. After
the deletion commit, client build, server tests, browser tests, crypto static
analysis, security regression and deployment tests pass.

Deletion never included `server/utils/durableMigration.js`. It remains a
required operational dependency.
