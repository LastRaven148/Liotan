# Stage 0 findings

All statuses below describe baseline SHA `1c50c64491e622f441684903b5a945b9c1342214` before remediation.

## SEC-2026-08-001 — Broken MLS encrypted media download runtime path

- Severity: High (feature availability and error-path integrity).
- Status: **FIXED**.
- Affected files: `server/controllers/cryptoV4/media.js`; route, R2, quota, roster, and integration-test dependencies.
- Current behavior: `downloadMedia` calls `assertConversationAccess`, `normalizeClientIds`, and `authorizedClientIds` without importing them. An otherwise valid committed media download reaches an undefined identifier and fails before authorization can complete.
- Preconditions: an authenticated crypto device requests a valid committed MLS media upload ID.
- Confidentiality: no demonstrated disclosure; execution fails before R2 streaming.
- Integrity: intended membership/device policy is not executable on this route.
- Availability: authorized downloads return an internal error.
- Exploitability: easy to trigger for a user who can reach the route; no privilege escalation is required.
- Proposed fix: import the existing shared access and roster primitives without weakening lifecycle, membership, device, range, quota, no-store, or private-R2 requirements.
- Required evidence: full/range route tests, invalid/excessive range, unknown/inaccessible/revoked/expired/lifecycle cases, missing/erroring R2, quota release, and no undefined identifier.
- Baseline evidence: `media.js` imported no access/roster helpers, while the download path referenced all three. A pre-fix route-level run returned 500 and logged `ReferenceError` before streaming.
- Remediation: imported the existing shared access and roster primitives; routed 5xx R2 errors through the common sanitized error handler; added a real authenticated route test with mocked private R2 and the real Mongo-backed quota, conversation, device-auth, and session layers.
- Verification: 49/49 server integration tests, 2/2 attachment unit tests, media-storage regression, crypto static analysis, syntax check, and `git diff --check` passed. Revoked devices retain the existing generic 401 device-auth response rather than disclosing that a known device is revoked.

## SEC-2026-08-002 — Non-atomic email code attempts, consumption, replacement, and expiry

- Severity: Critical for one-time authentication semantics.
- Status: **FIXED**.
- Affected files: `emailCodeService.js`, `EmailCode.js`, every email-code caller, tests, and possibly a durable index migration.
- Current behavior: replacement is `deleteMany` followed by `create`; verification is `findOne` followed by document `save` or `deleteOne`; successful non-consuming verification is separated from later consumption; expiry is not part of the security query; `{ emailHash, purpose }` is non-unique.
- Preconditions: concurrent requests using the same code, concurrent resend, delayed TTL cleanup, or multifactor flows that validate factors in separate operations.
- Confidentiality: no direct disclosure demonstrated.
- Integrity: attempts can be lost and one code can authorize multiple operations.
- Availability: concurrent resend/attempt races can invalidate or preserve the wrong record.
- Exploitability: practical with parallel requests; success still requires knowledge of a valid factor where applicable.
- Proposed fix: one current record per lookup, explicit expiry query, atomic failed-attempt increments, and a fail-safe reservation/consume primitive that commits only after all required factors pass.
- Required evidence: 20-way wrong attempts, 10-way consume, expired-record rejection, resend/save races, and registration/login/reset/email-change concurrency.
- Baseline evidence: `emailCodeService.js` lines 61–91 and `EmailCode.js` lines 35–45.
- Remediation: each `{ emailHash, purpose }` now maps to a deterministic string `_id`, so MongoDB's built-in unique `_id` index is the single-record invariant without a deployment-time index migration. Save is an atomic upsert, security queries bind the deterministic ID and an explicit creation cutoff, incorrect attempts use a bounded atomic increment, and successful consumption uses an exact `findOneAndDelete`. Legacy ObjectId records cannot authenticate and are removed after the replacement record exists. Login, reset, registration, and email-change confirmation consume the exact supplied code once and only after prior mandatory factors have passed.
- Verification: the pre-fix 20-way wrong-code reproduction left `attempts = 1`; after remediation, 20-way rejection stops at 5. Ten-way consume, ten-way save, expiry, sequential resend, legacy-record cleanup, and direct consume tests pass. Route-level races prove one registration, login, reset, current-email verification, and new-email confirmation winner; wrong password, wrong TOTP, and wrong new-email code preserve the still-required email code. The complete server suite passes 51/51 integration and 29/29 unit tests.

## SEC-2026-08-003 — Non-atomic TOTP step consumption

- Severity: High.
- Status: **OPEN**.
- Affected files: `secondFactorService.js`, `recentAuth.js`, TOTP primitives, `UserSecurity.js`, security-controller callers, and tests.
- Current behavior: callers read `lastUsedStep`, verify in memory, assign a new step, and save the whole document. Parallel requests can validate against the same old step before either save wins.
- Preconditions: two or more requests carrying the same currently valid TOTP.
- Confidentiality: no direct disclosure.
- Integrity: one TOTP step can authenticate more than one concurrent operation.
- Availability: whole-document saves can overwrite unrelated concurrent security-state changes.
- Exploitability: requires the current TOTP but allows replay inside its acceptance window.
- Proposed fix: compute the candidate step in memory, then accept it only through a conditional atomic update that advances `lastUsedStep` and modifies exactly one document.
- Required evidence: 2-way and 10-way login races, recent-auth and explicit reauthentication races, previous-step and restart persistence, and controlled DB write failures.
- Baseline evidence: `secondFactorService.js` lines 12–19 and `recentAuth.js` lines 52–62 duplicate the same read-modify-save sequence.

## SEC-2026-08-004 — Non-atomic backup-code consumption

- Severity: High.
- Status: **OPEN**.
- Affected files: the same second-factor callers, `backupCodes.js`, `UserSecurity.js`, and tests.
- Current behavior: a matching hash is removed from an in-memory array and the whole `UserSecurity` document is saved. Parallel requests can both accept the same hash and can overwrite unrelated array changes.
- Preconditions: concurrent requests with the same valid backup code.
- Confidentiality: no direct disclosure.
- Integrity: one recovery code can authorize multiple requests.
- Availability: concurrent whole-array saves may lose other unused codes.
- Exploitability: requires possession of a valid backup code.
- Proposed fix: identify the matching stored hash using timing-safe comparison, then atomically `$pull` that exact hash with success only when one document is modified.
- Required evidence: 2-way and 10-way consumption, exactly one remaining-count decrement, preservation of other codes, and controlled DB failure.
- Baseline evidence: `backupCodes.js` returns a replacement array; both `secondFactorService.js` and `recentAuth.js` assign it and call `save()`.

## SEC-2026-08-005 — Email-change cancellation scans only the first 100 pending records

- Severity: Medium.
- Status: **OPEN** (the unique cancel-token index is **ALREADY_FIXED**, but the runtime lookup does not use it).
- Affected files: `emailChangeSecurity.js`, `PendingEmailChange.js`, and integration tests.
- Current behavior: `cancelPendingEmailChange` loads at most 100 pending documents and manually compares token hashes despite an existing unique index on `cancelTokenHash`.
- Preconditions: the target record is outside the selected first 100 pending records.
- Confidentiality: no disclosure demonstrated.
- Integrity: a valid cancellation intent is not applied.
- Availability: account owners may be unable to stop a pending email change.
- Exploitability: depends on global pending-record volume/order; valid cancel token is still required.
- Proposed fix: direct indexed lookup combined with an atomic pending/unexpired-to-cancelled transition.
- Required evidence: target after 150 records, parallel cancellation, expiry/reuse behavior, session revocation, socket disconnect, and lock ownership.
- Baseline evidence: `emailChangeSecurity.js` lines 136–153; the model already declares `cancelTokenHash` unique and indexed.

## SEC-2026-08-006 — Email-change cancellation mutates state through GET

- Severity: Medium.
- Status: **OPEN**.
- Affected files: `authRoutes.js`, `emailChangeController.js`, security-page helpers, email-change security service, and tests.
- Current behavior: `GET /auth/email-change/cancel/:token` invokes cancellation immediately. Email security scanners and link previewers can therefore mutate account state.
- Preconditions: an automated scanner or browser follows a valid secret cancellation URL.
- Confidentiality: the secret remains in the URL; no additional disclosure demonstrated.
- Integrity: a non-confirming GET cancels the requested email change.
- Availability: legitimate email change is cancelled without user intent.
- Exploitability: common mail scanners routinely issue GET requests; knowledge of the link is inherent to scanning.
- Proposed fix: GET renders a self-contained no-store confirmation page; POST performs one atomic transition, revokes sessions, disconnects sockets, and clears only the matching email-change lock.
- Required evidence: repeated GETs do not mutate, POST does, parallel POST has one transition, invalid/expired/reused tokens fail safely, security headers are present, and no raw token is logged.
- Baseline evidence: `authRoutes.js` lines 122–126 route GET directly to the mutating controller.
