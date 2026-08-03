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
