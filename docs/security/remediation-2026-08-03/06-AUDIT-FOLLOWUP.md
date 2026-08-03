# Stage 0–1 audit follow-up

Date: 2026-08-03 (Europe/Moscow)

Working directory for every command below: `C:\Users\user\Desktop\Liotan`

Runtime/test commit: `6b160ac8ee9b6c3b9ea313f01f52c1359011b275`

## Independent-review findings

| Audit item | Confirmation | Action |
| --- | --- | --- |
| AUDIT-01 exact final HEAD lacked a full release gate | Confirmed for former HEAD `e0d25cc` | The final release gate for this follow-up is run after the last tracked commit. Its log is stored as an ignored release artifact, so recording the result cannot change the tested HEAD. |
| AUDIT-02 historical evidence omitted some literal commands/SHAs | Confirmed | `05-TEST-EVIDENCE.md` now identifies the historical limitation explicitly. No missing command is fabricated. This document uses an exact schema. |
| AUDIT-03 baseline/current wording conflicted | Confirmed | `02-FINDINGS.md` now separates baseline technical descriptions from current status/remediation fields. |
| AUDIT-04 email-code severity was too high | Confirmed | Reclassified from Critical to High with the demonstrated prerequisites stated explicitly. |
| AUDIT-05 media regression was one monolithic test | Confirmed | Replaced by five independently named integration tests. |
| AUDIT-06 log-redaction wording was too broad | Confirmed | Claims are limited to the application request-context logger; URL/browser/proxy/CDN/mail-scanner exposure remains documented residual risk. |
| AUDIT-07 stale `::git-*` UI directives | Not a repository defect | No repository action is needed. The branch and commits already existed, and no empty staging/commit operation was performed. |

## Confirmed media gaps and remediation

- Imports are the existing `assertConversationAccess`, `authorizedClientIds`, and `normalizeClientIds` primitives; no local authorization substitute was introduced.
- The former route trusted upstream status, `Content-Range`, and `Content-Length`. It now requires an exact 200/full or 206/range response matching the authenticated metadata and reservation.
- The low-level R2 path now counts actual streamed bytes and rejects short or oversized bodies.
- Client/target aborts propagate through `pipeline` and cause the controller to release a still-reserved transfer.
- A final ciphertext fragment is held behind a quota commit barrier. The client cannot receive a complete `Content-Length` response until `completeMediaTransfer()` succeeds.
- A false/failed post-stream settlement closes the response fail-closed. Window bytes and requests are charged at reservation time, so this path does not create a free-download retry loop.
- Full downloads reserve and complete exact metadata bytes; partial downloads reserve and complete exact normalized range bytes.
- Unknown and inaccessible objects both return 404. Revoked devices fail in device authentication with the existing generic 401 before object lookup. Expired devices receive the existing account-local expiry response before object lookup.

## Exact targeted evidence

Environment overrides for the Mongo-backed command:

```text
TEMP=C:\Users\user\Desktop\Liotan\node_modules\.cache\temp
TMP=C:\Users\user\Desktop\Liotan\node_modules\.cache\temp
npm_config_cache=C:\Users\user\Desktop\Liotan\node_modules\.cache\npm
MONGOMS_DOWNLOAD_DIR=C:\Users\user\Desktop\Liotan\node_modules\.cache\mongodb-binaries
```

### Low-level stream test

- Command: `node --test --test-concurrency=1 server/test/unit/uploadToR2Streaming.test.js`
- Exit code: 0
- Passed: 5
- Failed: 0
- Skipped: 0
- Coverage: exact bytes, held final fragment, oversized body, short body, premature target close.

### Authenticated media route tests

- Command: `node --test --test-concurrency=1 --test-timeout=120000 --test-name-pattern="MLS media download" server/test/integration/cryptoV4.integration.test.js`
- Exit code: 0
- Passed: 5
- Failed: 0
- Skipped: 0 among selected tests
- Coverage: full/range quota, upstream response consistency, authorization/lifecycle/device semantics, R2 failure, actual client abort, and failed post-stream quota settlement.

### Full unit and profile gates

- Command: `npm run test:unit --prefix server`
- Exit code: 0
- Passed: 36
- Failed: 0
- Skipped: 0
- Commands: `npm run test:media-storage`; `npm run test:crypto-static`; `npm run test:security`
- Exit codes: all 0
- Commands: `node --check server/controllers/cryptoV4/media.js`; `node --check server/utils/uploadToR2.js`; `node --check server/test/integration/cryptoV4.integration.test.js`; `node --check server/test/unit/uploadToR2Streaming.test.js`; `git diff --check`
- Exit codes: all 0

## Exact-HEAD release evidence rule

The final tracked commit is created before `npm run release:check`. The command uses repository-local temp, npm, MongoDB binary, and Playwright browser caches. No tracked evidence file is edited afterward. The exact command, HEAD, exit code, test counts, and artifact hashes are stored in an ignored file under `release/` and reported alongside the source archive and full binary diff.
