# Deletion and crypto migration runbook

All commands below run from the repository root. Never point them at production until the change is reviewed, backed up according to policy, and a maintenance window is approved.

## Required configuration

- `MONGO_URI`: target Mongo replica set; transactions are mandatory.
- R2 private-media and public-avatar credentials used by the existing deployment environment.
- `JWT_SECRET`, `SECURITY_ENCRYPTION_SECRET`, and `PRIVACY_HASH_SECRET` from the existing secret store. Do not paste them into shell history or logs.
- A single deployment release SHA and the Node/npm versions from `.node-version` and `package.json`.

## Safe pre-deploy sequence

```bash
npm ci
npm ci --prefix client
npm ci --prefix server
npm run release:check
cd server
node scripts/migrateCryptoState.js
```

The last command is dry-run by default. Save its sanitized counters, verify ambiguous legacy media is quarantined rather than deleted, and require the verification/reconciliation phases to report no blocker.

## Migration apply

Destructive warning: the following advances schema/data state in the configured database. Take an approved backup and verify `MONGO_URI` before running.

```bash
cd server
LIOTAN_CRYPTO_MIGRATION_CONFIRM=APPLY_50_1_0_CRYPTO_STATE_MIGRATION node scripts/migrateCryptoState.js --apply
```

Do not start a second copy. A durable lease rejects parallel execution. If interrupted, run the exact command again; it resumes from the persisted phase/cursor. Do not edit the migration-state collection manually. Re-run the dry-run command afterward and retain the sanitized verification output.

## R2 reconciliation

Dry-run only:

```bash
cd server
npm run cleanup:r2-detached
```

Review every safe prefix, truncation flag, and sampled locator. Do not apply detached cleanup merely because a key is old. Apply requires separate owner approval and confirmed bucket/environment; this change does not run it automatically.

## Deployment and rollback

The repository installer migrates the candidate release before switching the atomic `current` symlink. It must pass API health, frontend asset, WASM content-type, and PM2 checks. On failure it restores the previous symlink and process; `npm run test:deploy-installer` proves that local contract.

Do not deploy from this task. For a later approved deployment, use the repository's pinned GitHub/VPS release procedure. If post-switch smoke tests fail, restore the previous immutable release with the installer rollback procedure. Do not roll database state backward manually; the migration is forward/idempotent and application rollback compatibility must be evaluated before deployment.

## Post-deploy smoke tests

Use disposable staging accounts only:

1. Delete an empty private chat and confirm both online profiles lose it.
2. Repeat with one profile offline; reconnect and reload it.
3. Start a new chat and confirm a new conversation ID and empty history.
4. Block/unblock and attempt HTTP, MLS, media, and typing paths.
5. Change notifications in two profiles and provoke a version conflict.
6. Page beyond 100 devices and renew a near-expiry test manifest.
7. Run deletion inventory/reconciliation read-only checks and confirm there are no new dead-letter workflows.

Never use real user conversations for these smoke tests.
