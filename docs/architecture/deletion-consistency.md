# Deletion and account-state consistency

## State machines

Account and conversation deletion share one durable engine:

`requested -> planning -> planned -> frozen -> media-deleting -> invalidating -> completed`

`dead-letter` is terminal and requires operator reconciliation. `DeletionWorkflow` holds opaque workflow/idempotency hashes, state, bounded counters, retry time, and a renewable lease. `DeletionObjectTask` holds the exact local/R2 locator until physical deletion succeeds. Direct identifiers are unset after account completion.

The external-store boundary is deliberately ordered: plan exact owned objects, freeze all affected writes, delete physical objects idempotently, remove Mongo records and create invalidations in one transaction, then reconcile. A retry after process death resumes from persisted state. It never recreates a completed old conversation because the old random conversation ID and lookup record are gone.

## Freeze and race behavior

- `User.lifecycleState=deleting` blocks authentication-backed mutations by that account.
- `CryptoConversation.lifecycleState=deleting`, `blockedForEpochChange`, `deletionGeneration`, and `operationGeneration` block send, upload, edit/control, membership, and stale MLS commits.
- Pending `CryptoOperation` rows are cancelled and relevant uploads become `deletion-pending` in the freeze transaction.
- The active-workflow unique partial index and lease CAS serialize repeated requests and multiple backend workers.
- A write that commits before freeze is included in conversation-wide deletion. A write that observes freeze fails closed. The integration race test accepts both legal serializations and requires zero surviving conversation events.

## Mongo inventory

Account deletion owns: `User`, `Session`, `UserSecurity`, `RegistrationCancel`, `PendingEmailChange`, `EmailCode`, `UserNotificationSettings`, both sides of `UserBlock`, the deleted account's `ClientInvalidation`, `CryptoIdentity`, `CryptoDevice`, `CryptoDirectoryEntry`, `CryptoKeyPackage`, `CryptoRequestNonce`, account-requested `CryptoOperation`, and every affected conversation record below.

Conversation deletion owns: `CryptoConversation`, `CryptoEvent`, `CryptoOperation`, `AttachmentUpload`, `MessageVisibility`, `Message`, `E2EEConversation`, `E2EEKey`, affected `Group`, pinned/archived references, and durable invalidations for every surviving participant.

`DeletionWorkflow` is retained only as an anonymized operational journal. Completed `DeletionObjectTask` rows are removed. No message plaintext, ciphertext, media content, key, email, username, or raw idempotency key is written into the workflow log.

## Client invalidation protocol

`ClientInvalidation` is the durable source. Socket.IO `clientInvalidationAvailable` is only a latency hint. On initialization/reconnect the signed client pages invalidations before normal event sync, applies each item, then acknowledges it for the current MLS client ID.

Conversation invalidation wipes the CoreCrypto conversation, encrypted history, checkpoints, cursors, cached envelope state, offline media blobs, visible React chat, and open panel. Account deletion additionally removes the local CoreCrypto database, wrapped recovery material, offline media database, and account UI/session cache that the browser exposes. The guarantee is protocol non-continuation and deletion of accessible persistent state—not physical erasure of browser memory or storage media.

## Individual messages

“Delete for me” creates a unique `MessageVisibility` row and an account-wide `message-hidden` invalidation. Other participants keep the MLS ciphertext. “Delete for everyone” is an MLS control event. On decrypt, each client binds the control to the authenticated sender device and rejects edit/delete when the target message sender differs. Attachment deletion requires the one-use bound delete capability; old media API access ceases once cleanup completes.

## New contact after deletion

Private lookup resolution creates a new random conversation ID after the old record is gone. Initialization begins at epoch/sequence zero with new MLS group state. Old event URLs return not found, stale local state is removed by durable invalidation, and client message/ciphertext bindings are scoped to the destroyed conversation ID.
