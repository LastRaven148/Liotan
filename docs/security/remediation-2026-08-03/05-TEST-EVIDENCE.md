# Test evidence

This file records concise, reproducible local evidence. Production systems and secrets are never used.

## Baseline checks

- Date: 2026-08-03 (Europe/Moscow)
- Commands: required-path checks; `git status --short`; `git status --branch --short`; `git rev-parse --show-toplevel`; `git rev-parse HEAD`; `git branch --show-current`; root/client/server version reads; `node --version`; `npm --version`.
- Exit code: 0.
- Result: workspace valid, historical baseline SHA `1c50c64491e622f441684903b5a945b9c1342214`, version `57.4.4`, clean worktree, Node `v22.22.3`, npm `10.9.8`.
- Skipped: no Markdown link-checker exists in the repository.

## Stage 0 documentation checks

- Date/time: 2026-08-03T03:13:54+03:00 to 2026-08-03T03:13:55+03:00.
- Command: `npm run test:security`.
- Exit code: 0.
- Result: security regression checks passed.
- Command: `git diff --check`.
- Exit code: 0.
- Result: no whitespace errors.
- Repository evidence: `git status --short` reported only the new `docs/security/remediation-2026-08-03/` directory. The four historical security documents enforced by `scripts/securityRegression.js` and the complete `remediation-2026-07-23` directory remain present.
- Skipped: Markdown link validation because no link-checker is configured in package scripts, workflows, dependencies, or repository scripts.

## SEC-2026-08-001 — MLS encrypted-media download

- Date/time: 2026-08-03T03:18–03:22+03:00.
- Minimal pre-fix command: inline Node invocation of `downloadMedia` with a valid mocked upload lookup.
- Exit code: 0 for the proof harness; captured result `ReferenceError: assertConversationAccess is not defined`.
- First route-test command: `npm run test:integration --prefix server`.
- Exit code: 1; 48 passed, 1 failed. The first draft fixture used usernames longer than the existing auth policy and was corrected before evaluating the production finding.
- Second pre-fix route-test command: `npm run test:integration --prefix server`.
- Exit code: 1; 48 passed, 1 failed. The new authenticated media route returned 500 instead of 200 and the structured server log identified `ReferenceError`.
- Post-fix route-test command: `npm run test:integration --prefix server`.
- Exit code: 0; 49 passed, 0 failed, 0 skipped. Covered full ciphertext, valid/invalid/excessive ranges, unknown and inaccessible uploads, temporary/deletion-pending lifecycle rejection, revoked and expired devices, R2 missing/timeout errors, sanitized responses, private storage class, quota completion/release, and fail-closed conversation state.
- Additional command: `node --test server/test/unit/attachmentUpload.test.js`.
- Exit code: 0; 2 passed, 0 failed, 0 skipped.
- Additional commands: `npm run test:media-storage`; `npm run test:crypto-static`; `node --check server/controllers/cryptoV4/media.js`; `git diff --check`.
- Exit codes: all 0. Media-storage and crypto-static regressions passed; syntax and whitespace checks were clean.

## SEC-2026-08-002 — Atomic, expiry-bound email codes

- Date/time: 2026-08-03T03:24–03:36+03:00.
- Pre-fix command: `npm run test:integration --prefix server` after adding the Mongo-backed concurrency reproduction.
- Exit code: 1; 49 passed, 1 failed. Twenty simultaneous incorrect submissions left `attempts = 1` instead of the required cap of 5, confirming a lost-update race.
- Primitive post-fix command: `npm run test:integration --prefix server`.
- Exit code: 0; 50 passed, 0 failed. The test covers 20-way incorrect attempts, 10-way correct consumption, a physically present expired record, 10 simultaneous replacements, sequential resend invalidation, exact one-time consume, and removal of legacy ObjectId duplicates.
- First full-flow command: `npm run test:integration --prefix server`.
- Exit code: 1; 50 passed, 1 failed. The new fixture attempted to age immutable `Session.createdAt` through Mongoose, so the tested session correctly remained under the existing 72-hour restriction. No production defect was indicated; the fixture was changed to use the raw test collection and to clear `reauthenticatedAt`.
- Final full-flow command: `npm run test:integration --prefix server`.
- Exit code: 0; 51 passed, 0 failed, 0 skipped. Route-level coverage includes ten-way registration, login and password-reset races; two-way current-email verification and new-email confirmation; preservation after wrong password, wrong TOTP and wrong new-email code; and exactly one resulting user, session operation, password mutation, or pending email change.
- Additional commands: `npm run test:unit --prefix server`; `npm run test:security`; `node --check` for every changed controller/service/route; `git diff --check`.
- Exit codes: all 0; 29 unit tests and the security regression passed, with clean syntax and whitespace.
- Transition evidence: security queries address only a deterministic string `_id` derived from validated `{ emailHash, purpose }`; therefore old ObjectId records are fail-closed and cannot authenticate. A successful new-code upsert is followed by cleanup of other same-pair records, which the integration test verifies. No new production index or data migration is required; any outstanding pre-remediation email code must be resent.

## SEC-2026-08-003/004 — Atomic TOTP and backup-code consumption

- Date/time: 2026-08-03T03:39–03:50+03:00.
- First pre-fix targeted command: `node --test --test-concurrency=1 --test-timeout=120000 --test-name-pattern="TOTP steps and backup codes" server/test/integration/cryptoV4.integration.test.js`.
- Exit code: 1. The same TOTP step produced 10 successes instead of 1.
- Expanded pre-fix targeted command: the same command after collecting both races with `Promise.allSettled`.
- Exit code: 1. Exact result: `totpWinners = 10`, `totpErrors = 0`, `backupWinners = 1`, `backupErrors = 9`. Backup exclusion depended on Mongoose `VersionError` rather than a controlled conditional consume.
- Post-fix targeted commands: the same TOTP/backup name-pattern; then `--test-name-pattern="TOTP steps|login orders|recent-auth"`; and individual recent-auth reruns while correcting two test-only fixture errors.
- Final targeted result: 3 passed, 0 failed, 0 skipped among selected tests. Covered ten-way direct TOTP, two-way and ten-way backup consumption, remaining-hash preservation, previous-step rejection, same-step replay after clearing/reloading the service modules, two-way and ten-way login, two-session recent-auth, two-session explicit reauthentication, wrong password/email-code ordering, concurrent TOTP activation, stale-session TOTP disable, and a simulated Mongo error code 112 with unchanged `lastUsedStep`.
- Fixture corrections: names longer than the existing auth-token username policy caused `auth required`, and one async request helper was incorrectly chained with `.expect`. Both were corrected in test code before product evaluation.
- Full command: `npm run test:integration --prefix server`.
- Exit code: 0; 54 passed, 0 failed, 0 skipped.
- Additional commands: `npm run test:unit --prefix server`; `npm run test:security`; `npm run test:crypto-static`; syntax checks for the shared service, middleware and controller; `git diff --check`.
- Exit codes: all 0; 29 unit tests, security regression, crypto static analysis, syntax, and whitespace checks passed.
- Implementation evidence: `rg` after remediation finds authentication-time `verifyTotp`, `lastUsedStep`, and `totp.backupCodeHashes` consumption only in `security/totp/secondFactor.js`; `secondFactorService`, `recentAuth`, and `requireReauthentication` delegate to it. Security-controller activation and disable use conditional updates rather than document `save()`.
