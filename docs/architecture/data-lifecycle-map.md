# Liotan data-lifecycle architecture map

Baseline: `origin/main` at `80c035d8e187e64c22feddfc91cced1284829e54`.

This document records executable production paths, not intended behavior. The companion command `npm run audit:architecture` fails when a referenced file or marker disappears, forcing this map to be updated with architectural changes.

## Baseline production paths

| Concern | Executable path | Baseline behavior |
| --- | --- | --- |
| Account deletion | `DELETE /me/account` -> reauthentication middleware -> `profileController.deleteAccount` -> `deleteAccountData` | Sequential destructive calls without a durable workflow, lease, journal, restart recovery, or cross-store completion boundary. Group conversations survive with the user removed. |
| Whole-chat deletion | `DialogItem` -> `useChat.deleteChat` | The client only closes the active panel. No production HTTP or MLS deletion request exists. Legacy Socket.IO mutations are tombstones returning `mls-v4-required`. |
| Message deletion | `useChat.sendControl` -> `mlsEngine.sendControl` -> signed MLS ciphertext event -> recipient decrypt/dispatch | “For everyone” is an encrypted control event. “For me” is only transient React state and is not account-synchronised. |
| MLS writes | signed crypto route -> `cryptoDeviceAuth` -> `assertConversationAccess` -> Mongo transaction | Conversation membership and device signatures are checked, but no deleting lifecycle or user-block relationship is checked. `sendCiphertext` reads access without attaching the active transaction session. |
| MLS media | signed multipart upload -> R2 -> `AttachmentUpload`; commit/delete capability -> MLS event | Temporary/committed/deletion-pending metadata exists. Cleanup is bounded to 200 but guarded only by a process-local boolean, not a distributed lease. |
| Client invalidation | ephemeral Socket.IO events in `useSocket` | No durable replay for offline devices. Whole-conversation MLS/CoreCrypto state and encrypted history have no purge API. |
| Notifications | `NotificationsPage` and `notificationSound` -> `localStorage` | Browser-local values are the source of truth; there is no server version or cross-device conflict handling. |
| Device list | `GET /crypto/v4/devices` -> `.limit(50)` -> `listCryptoDevices` | No cursor. Directory verification requires commitments for the complete device set. Device manifests last one year and are not renewed. |
| Blocklist | privacy settings copy only | No relationship model, API, or enforcement point exists. |
| CSS | `App.jsx` -> `App.css` ordered imports -> `styles/*` | The refactored layer split is active. Four `!important` declarations are confined to reduced-motion accessibility rules. No architecture gate exists. |

## Implemented production paths

| Concern | Authoritative path after this change | Consistency guarantee |
| --- | --- | --- |
| Account deletion | reauthentication + CSRF + 2FA -> `DeletionWorkflow` -> freeze -> durable object tasks -> Mongo transaction -> durable invalidations -> reconciliation | A request cannot report `completed` while any known R2/local object task or Mongo record remains. A lease/CAS allows one backend process to advance a workflow. |
| Whole-chat deletion | signed MLS device request -> `requestConversationDeletion` -> the same workflow engine | There is one global policy for private and group chats. The client waits for `completed`; a `202` remains visibly pending and is not an optimistic deletion. |
| Per-message deletion | MLS authenticated delete control for everyone; `MessageVisibility` + `ClientInvalidation` for the current account | “For me” is durable and account-scoped without removing ciphertext needed by peers. “For everyone” is accepted only when the decrypted authenticated control sender owns the target message. |
| Blocklist | `UserBlock` -> protected cursor API -> `blockPolicy` at HTTP/MLS/media/profile/search/Socket.IO boundaries | Block/unblock are idempotent, self-block is rejected, and the denial is neutral. Existing conversations remain but writes are blocked. |
| Notifications | `UserNotificationSettings` with expected-version CAS -> durable account invalidation | Mongo is the source of truth. Optimistic UI rolls back to the server-provided current value after conflict/failure. |
| Devices | stable cursor pages plus complete directory commitments; signed renewal endpoint and client timer | Active, pending, expired, and revoked devices remain visible beyond 100 rows. Renewal retains device identity and retries with bounded backoff. |
| CSS | deterministic `App.css` and nested layer graph -> architecture gate -> double-build hash comparison | Deleted monoliths, import cycles, unreachable chunks, unexplained `!important`, global leakage, and mobile/iOS duplication fail the release gate. |

R2 ownership is proved against remaining Mongo references before a task is created. A locator referenced outside the deletion plan is retained and counted as `sharedMediaRetained`; only the deleting metadata is removed. Avatar fields use their actual `avatarStorageKey`/`avatarStorageType` names and are included in the same durable object-task path.

## Authoritative stores and deletion ownership

| Store | Authoritative records | Required owner of deletion |
| --- | --- | --- |
| Mongo account/security | `User`, `Session`, `UserSecurity`, email and registration records | Account deletion workflow |
| Mongo MLS | identity, devices, directory log, packages, nonces, conversations, operations, events | Account/conversation deletion workflow |
| Mongo legacy | `Message`, `E2EEConversation`, `E2EEKey`, `Group` | Account/conversation deletion workflow; legacy endpoints remain compatibility tombstones |
| Mongo media metadata | `AttachmentUpload` plus avatar/message references | Deletion workflow until physical object deletion is confirmed |
| R2/local uploads | private media and public avatars | Durable object tasks with retry and reconciliation |
| Browser CoreCrypto | per-account/per-device IndexedDB database | Durable invalidation consumer; full database purge for deleted account and conversation wipe for deleted chat |
| Browser encrypted cache | recovery keys, MLS checkpoints, encrypted history | Durable invalidation consumer with conversation/account-scoped purge |
| Browser offline media | `liotan-offline-media-v2` | Durable invalidation consumer using bound media identifiers |

## Target consistency boundary

Deletion is a state machine, not a controller helper:

`requested -> planning -> planned -> frozen -> media-deleting -> invalidating -> completed`

- A Mongo CAS lease permits only one worker to advance a workflow across backend instances.
- Planning snapshots every affected conversation and participant before any destructive write.
- Freezing and every subsequent MLS mutation share a transaction-visible lifecycle predicate.
- R2 deletion is external to Mongo. Object tasks remain durable and the workflow cannot report `completed` until each mandatory object is confirmed absent.
- Durable per-recipient invalidations are written before conversation metadata is removed. Socket.IO is only a low-latency hint.
- The `media-deleting -> invalidating` transition deletes Mongo records and creates durable invalidations in one transaction. The final `invalidating -> completed` transition runs reconciliation first.
- Completion removes direct account identifiers from retained workflow metadata and keeps only an opaque idempotency digest and sanitised counters.
- A new contact after completion resolves to a new random conversation identifier and fresh MLS state; active workflows prevent lookup-key recreation races.

## Cross-cutting enforcement points

Block relationships and deletion lifecycle must be enforced at every production boundary:

1. conversation resolution;
2. MLS operation begin/commit;
3. ciphertext and control-event send;
4. media upload, commit, delete capability, and download;
5. group membership mutation where the actor targets a blocked relationship;
6. user search/profile disclosure;
7. legacy HTTP and Socket.IO mutation tombstones so no downgrade path appears;
8. reconnect/bootstrap and durable invalidation polling.

Calls are deliberately outside this change.

## Baseline evidence

- Root, client, and server `npm ci`: passed with zero audit vulnerabilities.
- `npm run release:check`: passed, including build, syntax, unit, integration, Chromium/Firefox/WebKit, security, crypto static analysis, deployment regressions, coverage, licence policy, SBOM, and dependency audit.
- Workflow YAML parsing and deployment shell syntax checks: passed.
- Repeated SBOM generation produced identical hashes.
- No production database, R2 bucket, user, deployment, or merge action was performed during the audit.
