# Full security remediation: executive summary

## Scope and custody

- Audited repository: `LastRaven148/Liotan`.
- Audited and base commit: `558d9484a4c72885ed2332471f8672736cd141d2`.
- Remediation branch: `codex/full-security-remediation-2026-07-23`.
- The audit archive was extracted outside the repository and treated as an
  untrusted backlog, not as source of truth.
- `git ls-files` reported 440 tracked files at the audited commit. The
  code-and-generated-evidence checkpoint `d43e6e8` has 460 tracked files after intentional
  additions, evidence and proven deletions; the final count must always be obtained from
  `git ls-files`, including these evidence documents.
- No production database, R2 bucket, Cloudflare, Nginx, DNS, PM2 process, VPS,
  secret, deployment, merge, or `main` history was changed.

## Outcome

The remediation replaces the highest-risk trust shortcuts with enforceable
protocol and storage invariants:

- encrypted-media authorization now completes before multipart body parsing;
- durable byte, request, concurrency, object, storage, and egress quotas apply
  across global, account, device, session, and IP scopes;
- long-lived sockets disconnect at exact JWT expiry and re-check session/device
  state;
- a random device-authentication key is independent from account recovery, and
  recovery creates a new visible device instead of impersonating an old one;
- device-directory changes enter an append-only Merkle log with signed
  checkpoints, inclusion proofs, consistency proofs, local pin continuity, and
  checkpoint gossip;
- avatar replacement uses leases, compare-and-swap ownership, retryable object
  cleanup, and dry-run reconciliation;
- legacy read/write routes are tombstoned and a resumable, object-first,
  dry-run-by-default retirement migration exists;
- edit/delete controls use a sender-bound, revisioned, replay- and fork-resistant
  mutation chain;
- release archives, client builds, deployment bundles, installer checks, and
  GitHub attestations bind to one exact source commit;
- pull-request CI checks out the exact reviewed head, trusts only its exact
  container workspace, and creates release staging in an atomically allocated
  temporary directory;
- CycloneDX evidence is generated from complete lockfiles and is reproducible
  across Windows and Linux instead of reflecting host-specific optional
  packages;
- root, client and server production versions are synchronized and CI requires
  every production candidate to increase the version relative to its base SHA;
- high dependency advisories were removed, workflow permissions were narrowed,
  and production import reachability is enforced;
- filesystem, Mongo query/property, and release TOCTOU sinks identified during
  re-audit were removed.

## Finding disposition

The detailed matrix is in `B_FINDING_STATUS_MATRIX.md`. Of 27 original and new
findings:

- 20 are `FIXED`;
- 1 is `NOT APPLICABLE`;
- 5 are `RESIDUAL PLATFORM LIMITATION`;
- 0 are `BLOCKED BY PRODUCTION ACCESS`;
- 1 is `REQUIRES EXPLICIT PRODUCT DECISION`; the current decision is
  `RETAIN FOR NOW`, and destructive retirement requires a new decision.

There is intentionally no `DEFERRED` state.

## Protocol and data changes

The branch introduces:

- device request-auth protocol v2;
- recovery record v2 and an in-place v1-to-v2 client migration that preserves
  the MLS identity while generating an independent local device key;
- key-transparency log schema v1;
- encrypted message mutation chain v2;
- durable media quota reservation and storage lifecycle fields;
- durable avatar object/lease state;
- durable legacy object-retirement tasks;
- explicit legacy mutation cutoff sequence.

Migration and rollback details are in
`D_DEVICE_RECOVERY_MIGRATION.md`,
`F_LEGACY_RETIREMENT_PLAN.md`, and
`I_BREAKING_CHANGE_AND_ROLLBACK_PLAN.md`.

## Non-code boundaries

The following cannot be honestly closed by repository code alone:

- browsers do not expose portable TPM, Secure Enclave, or Android Keystore
  isolation for this web application;
- a server-operated transparency log has no independent external witness;
- recipients can retain plaintext or old key material after a delete event;
- exact security properties inside the third-party CoreCrypto/WASM
  implementation are outside this repository;
- 33 historical high CodeQL alerts remain open on `main` and require deliberate
  baseline triage even though the aggregate `CodeQL` check is now mandatory;
- physical production legacy deletion requires a new explicit owner decision;
  the current recorded decision is `RETAIN FOR NOW`.

These boundaries are specified in `K_RESIDUAL_RISKS.md`.
