# Threat model: deletion and account-scoped settings

## Assets and trust boundaries

Assets are account identifiers, sessions, device roots/manifests, MLS membership/events, encrypted local history, message visibility, settings, Mongo metadata, local uploads, and R2 objects. Boundaries are the browser storage adapter, authenticated HTTP, signed crypto HTTP, Socket.IO session registry, Mongo transactions, the durable worker lease, and R2/local object deletion.

## Threats and controls

| Threat | Control | Evidence |
| --- | --- | --- |
| CSRF or stolen ambient session deletes data | CSRF middleware, recent password reauthentication, and TOTP when enabled; crypto deletion also requires the active device signature | authentication lifecycle integration test and route-order security regression |
| Repeated request or two backend processes duplicate destruction | hashed idempotency binding, unique active subject index, lease owner/expiry CAS, idempotent deletes | parallel request/worker and interrupted R2 tests |
| Send/upload/stale MLS commit races with deletion | transactional lifecycle freeze, generation increment, pending-operation cancellation, access checks inside mutations | concurrent send/delete, stale operation, upload lifecycle tests |
| R2 fails after Mongo mutation | external objects are deleted first through durable retry tasks; Mongo metadata remains while retry is pending | R2 failure/resume test |
| Shared object is deleted incorrectly | task planning checks remaining `AttachmentUpload`, message, user-avatar, and group-avatar references | external-reference retention test |
| Offline client resurrects old state | durable ordered invalidations, per-device acknowledgment, purge before ordinary sync, deleted conversation API returns not found | browser invalidation probes and conversation recreation integration test |
| Malicious participant deletes another sender's message | authenticated MLS envelope binding and target-sender equality on edit/delete | crypto browser suite and static security assertion |
| Block is bypassed through another transport | common `blockPolicy` at resolve, operation, send, media, search/profile, typing/socket, and legacy tombstones | blocklist integration test |
| Notification conflict silently loses changes | expected-version CAS returns authoritative current value; UI rolls back and refetches via durable invalidation | integration and two-profile browser tests |
| Device directory rollback or expired manifest | signed append-only directory, highest-seen encrypted pin, expiry enforcement, signed identity-preserving renewal | device, rollback, expiry, and time-bound renewal tests |
| Username/email is reused after deletion | account record and hashes are removed only at the final Mongo stage; active workflow keeps the account frozen until then; new registration creates unrelated user/crypto identifiers | workflow ordering and fresh-conversation tests; production uniqueness timing remains an operational check |
| Rollback restores code while migration/schema changed | migration is resumable/idempotent and runs before release switch; installer regression restores the old symlink/process on failed health checks | migration and deployment rollback regression |

## Residual risks

- Local tests use a real Mongo replica-set transaction engine but not production topology, latency, elections, or sharding.
- R2 behavior is exercised through faithful adapters; bucket policy, lifecycle rules, replication, and provider-side retention require staging/production verification.
- Browsers do not guarantee physical flash/RAM erasure. Liotan deletes reachable persistent records and cryptographically prevents continuation.
- iOS/Android future native wrappers need storage-adapter conformance tests. No browser-specific deletion business logic exists.
- A dead-letter object task needs an operator to inspect the sanitized code and retry after the external dependency is restored.
