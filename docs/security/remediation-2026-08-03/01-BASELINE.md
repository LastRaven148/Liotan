# Stage 0 baseline

## Repository and runtime

| Property | Value |
| --- | --- |
| Workspace | `C:\Users\user\Desktop\Liotan` |
| Branch | `codex/security-remediation-stages-0-1-2026-08-03` |
| Baseline SHA | `1c50c64491e622f441684903b5a945b9c1342214` |
| Root/client/server version | `57.4.4` / `57.4.4` / `57.4.4` |
| Node.js | `v22.22.3` |
| npm | `10.9.8` |
| OS | Windows NT `10.0.19045.0` |
| Worktree before branch creation | Clean; `main` matched `origin/main` |
| Lockfiles | Root, client, and server lockfiles present |

No environment-file contents or secrets were read or copied.

## Existing verification entry points

Security and release scripts include `test:security`, `test:crypto-static`, `test:media-storage`, `test:server`, `test:unit`, `test:integration`, `test:browser`, `test:deployment-bundle`, `release:check`, and `test:coverage` in the root package. Server tests use `node:test`, `MongoMemoryReplSet`, Supertest, and Socket.IO test clients.

Browser coverage currently consists of:

- `client/test/browser/mls-core.spec.js`
- `client/test/browser/production-app.spec.js`
- `client/test/browser/settings-consistency.spec.js`
- their local fixtures and production network guard

No Markdown link-checker is configured in package scripts, workflows, or the dependency lockfile.

## Relevant module boundaries

- Authentication orchestration: `server/controllers/authController.js` and `server/controllers/auth/*`.
- One-time email codes: `server/controllers/auth/emailCodeService.js` backed by `server/models/EmailCode.js`.
- TOTP and backup codes: `server/security/totp`, `server/security/recovery`, `server/controllers/auth/secondFactorService.js`, and `server/middleware/recentAuth.js` backed by `server/models/UserSecurity.js`.
- Email-change lifecycle: controller code in `server/controllers/auth/emailChangeController.js`, security state transitions in `server/security/emailChange/emailChangeSecurity.js`, and `server/models/PendingEmailChange.js`.
- MLS delivery and encrypted media: `server/controllers/cryptoV4/*`, `server/middleware/cryptoDeviceAuth.js`, `server/middleware/mediaAuthorization.js`, `server/services/mediaQuota.js`, and the corresponding crypto/media models.

## Relevant baseline indexes

- `EmailCode`: TTL cleanup on `createdAt`; non-unique `{ emailHash, purpose }` index. There is no uniqueness guarantee for a current code.
- `UserSecurity`: unique `userId`; the embedded TOTP fields have no independent atomic-consumption index requirement.
- `PendingEmailChange`: unique indexed `cancelTokenHash`; compound indexes for `{ userId, status, createdAt }` and `{ newEmailHash, status, applyAfter }`.
- `AttachmentUpload`: unique `uploadId`; partial unique `{ cryptoConversationId, bindingId }` for `mls-media-1`; lifecycle/quota indexes.
- `CryptoDevice`: unique `clientId` and `{ userId, deviceId }`; status and manifest-expiry indexes.
- `CryptoConversation`: unique `conversationId` and `lookupKey`; participant, roster, lifecycle, and epoch-blocking indexes.
- `MediaTransferReservation`: unique `reservationId`; state/expiry and terminal purge indexes.
- `Session`: unique session hash plus user, expiry, device, and revocation-oriented compound indexes.

## Stage 1 affected files

Expected direct changes are limited to the current implementations and regression coverage around:

- `server/controllers/cryptoV4/media.js`
- `server/controllers/auth/emailCodeService.js`
- `server/models/EmailCode.js`
- all actual email-code callers in auth, registration-security, and email-change controllers
- `server/controllers/auth/secondFactorService.js`
- `server/middleware/recentAuth.js`
- `server/security/totp/totp.js`
- `server/security/recovery/backupCodes.js`
- `server/models/UserSecurity.js`
- `server/security/emailChange/emailChangeSecurity.js`
- `server/controllers/auth/emailChangeController.js`
- `server/routes/authRoutes.js`
- `server/controllers/auth/securityPages.js`
- `server/models/PendingEmailChange.js`
- `server/test/integration/cryptoV4.integration.test.js` and focused unit/regression tests
- a production-safe email-code index migration only if the chosen invariant requires one

This list is a boundary, not permission to change every file in it. Each change still requires a reproduced finding.
