# Legacy retirement plan

## Current repository state

- legacy message/group/attachment write surfaces are tombstoned with `410`;
- no Crypto v4 failure path falls back to plaintext or legacy writes;
- active production code no longer imports the legacy controllers/socket
  handlers removed in `4036aa9`;
- `server/utils/durableMigration.js` remains in use by operational migrations
  and integration tests;
- production legacy records and objects have **not** been deleted.

## Product decision

Applying retirement is `REQUIRES EXPLICIT PRODUCT DECISION` because it
irreversibly deletes real data. The owner must choose exactly one outcome after
reviewing aggregate production counts:

1. retain legacy data under tombstoned, non-readable application surfaces for a
   documented retention period; or
2. authorize the `50.4.0-legacy-data-retirement` migration.

Silence is not authorization to delete.

## Safe decision evidence

Run only the read-only inventory/checklist first:

```powershell
cd server
$env:NODE_ENV = "production"
npm run audit:data-inventory -- --production-read-only
node scripts/retireLegacyData.js
```

Both commands output aggregate counts only. The second command is a count-only
dry run by default. Do not paste connection errors, URIs, object keys, user
identifiers or raw records into the PR.

## Authorized apply design

If the owner explicitly selects deletion:

1. verify a recoverable backup and retention evidence;
2. enable application maintenance mode;
3. record the exact reviewed release SHA and migration dry-run aggregates;
4. set the exact `LIOTAN_LEGACY_RETIREMENT_CONFIRM` value documented by the
   script;
5. run `retireLegacyData.js --apply`;
6. allow the durable migration lease/checkpoints to resume after interruption;
7. process `LegacyRetirementObjectTask` entries object-first;
8. treat R2 `404` as idempotent success;
9. move retry-exhausted object tasks to dead letter, never silently skip them;
10. delete Mongo metadata only after its object task has succeeded;
11. run the verification phase and aggregate inventory again;
12. retain logs with counts and migration ID, not raw identifiers.

The migration refuses production apply without maintenance mode and exact
confirmation.

## Failure and rollback

Before apply, rollback is simply “do not run apply.” During apply, the migration
is resumable, not reversible: deleted R2 objects cannot be reconstructed from
Mongo metadata. A backup restore is the only data rollback and must be validated
before authorization.

Application rollback must retain:

- legacy write tombstones;
- migration state and object task collections;
- schema compatibility for remaining tasks;
- no-plaintext-fallback behavior.

Restoring old legacy routes or writes is not an acceptable rollback.
