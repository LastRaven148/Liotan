# Breaking changes and rollback plan

## Compatibility-impacting changes

| Area | Change | Compatibility consequence |
|---|---|---|
| Device auth | v2 random device credential with session-bound manifests/requests | A migrated v2 device must not fall back to v1. |
| Recovery | Recovery enrolls a new visible device | Product/UI must not describe recovery as restoring an old trusted device. |
| Transparency | Directory mutations require signed Merkle-log state and proofs | Server requires a valid independent transparency signing seed; clients pin/continue checkpoints. |
| Media | Pre-body auth and signed ciphertext reservation; durable lifecycle fields | Old unsigned/legacy upload paths are rejected; old clients require upgrade. |
| Message mutation | v2 target/revision/previous-mutation chain and cutoff sequence | Pre-cutoff history remains readable, but updated clients enforce v2 controls after cutoff. |
| Legacy APIs | Legacy message/group/attachment paths return `410` | There is no compatibility fallback to plaintext or legacy writes. |
| Secrets/R2 | Independent secret validation and separate private-media/public-avatar buckets | Production environment must provide the new names and distinct values. |
| Release | Source SHA and transparency pin are verified in manifests and attestation | Unbound or unpinned bundles are rejected. |

## Versioned migrations

| Order | Migration ID | Purpose | Default |
|---:|---|---|---|
| 1 | `50.1.0-crypto-state-v4` | Normalize Crypto v4 state and preserve compatible identity state. | Inspect/dry run unless exact apply confirmation is set. |
| 2 | `50.2.0-key-transparency-v1` | Backfill directory leaves/nodes/checkpoint state. | Inspect/dry run unless exact apply confirmation is set. |
| 3 | `50.3.0-media-quota-lifecycle` | Backfill upload lifecycle/scopes and reconcile durable totals. | Inspect/dry run unless exact apply confirmation is set. |
| 4 | `50.5.0-message-mutation-chain` | Establish deterministic legacy cutoff sequence. | Inspect/dry run unless exact apply confirmation is set. |

`50.4.0-legacy-data-retirement` is intentionally **not** part of automatic
deployment. It is destructive and requires the separate product decision in
`F_LEGACY_RETIREMENT_PLAN.md`.

All migrations use `server/utils/durableMigration.js` for leases,
checkpoints/resume and failure state. The installer stops the old backend before
forward migrations so it cannot write an incompatible old format concurrently.

## Required pre-deployment review

1. Review every commit and the finding matrix.
2. Require two clean release runs on the final SHA.
3. Verify root/client/server audits and the branch CodeQL scan.
4. Set a canonical 32-byte Ed25519 transparency seed and expose the matching
   public key to the client build without publishing the seed.
5. Provide all independent secrets and separate R2 credentials/buckets.
6. Back up Mongo and confirm restore evidence.
7. Run every migration in inspect/dry-run mode against an authorized staging
   clone.
8. Run the production read-only checklist.
9. Schedule maintenance; do not combine legacy retirement with the release.

## Forward deployment order

The reviewed installer enforces:

1. verify GitHub artifact attestation and exact expected SHA;
2. validate deployment/client manifests, version and transparency pin;
3. validate candidate layout and public symlink preconditions;
4. stop the old PM2 backend;
5. run migrations 50.1, 50.2, 50.3 and 50.5 with exact confirmations;
6. atomically switch `current`;
7. restart PM2, wait for health, validate version/runtime and frontend;
8. save PM2 state;
9. leave legacy retirement untouched.

No deployment was executed during remediation.

## Rollback classes

### Before migration

If artifact/provenance/preflight fails, keep the old `current` target and PM2
process. No state rollback is needed.

### After compatible migration, before switch

Restart the old release only if its code can safely read the migrated schemas.
The installer performs verified rollback, but v2 rejection/tombstone invariants
must remain. Never re-enable v1 device writes or legacy plaintext routes.

### After switch

Atomically restore the previous release symlink, restart PM2, verify health,
runtime path, version and frontend. Preserve all new collections/fields and
pending durable tasks.

### Data rollback

Normal forward migrations are designed to be additive/resumable. Do not
manually delete their state during rollback. Destructive legacy retirement can
only be rolled back from a proven backup; therefore it is outside automatic
deployment and requires separate authorization.

## Fail-closed rules

- no plaintext fallback;
- no legacy write fallback;
- no device-auth v1 downgrade after v2;
- no unsigned/unpinned production bundle;
- no transparency key reuse with JWT/recovery/email secrets;
- no proceeding when migration, health, PM2, manifest or source SHA checks fail.
