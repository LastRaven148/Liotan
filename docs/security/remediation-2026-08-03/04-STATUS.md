# Remediation status

| ID | Status | Commit | Tests | Residual risk | Notes |
| --- | --- | --- | --- | --- | --- |
| SEC-2026-08-001 | FIXED | `10d3d76` | 49 integration; 2 attachment unit; media-storage and crypto-static gates | No known residual in tested route; live R2 was intentionally not accessed | Full/range/access/lifecycle/device/R2/quota paths covered |
| SEC-2026-08-002 | FIXED | `fix(auth): make email codes atomic and expiry-bound` | 51 integration; 29 unit; security regression | Outstanding pre-remediation codes require resend; no deployment migration is needed | Deterministic `_id`, atomic replace/attempt/consume, explicit expiry, and all callers covered |
| SEC-2026-08-003 | FIXED | `fix(auth): atomically consume totp and backup codes` | 54 integration; targeted 2/10-way TOTP, recent-auth, explicit reauth, restart and DB-failure cases | A valid new TOTP is needed after a fail-closed database error | One shared conditional-update primitive; no step is returned externally |
| SEC-2026-08-004 | FIXED | `fix(auth): atomically consume totp and backup codes` | Targeted 2/10-way backup races plus full auth integration | No known residual in the tested consumption path | Exact timing-safe hash match and atomic `$pull`; other hashes preserved |
| SEC-2026-08-005 | FIXED | `fix(auth): harden email change cancellation` | 56 integration; 150-record/index/two-POST/expiry/reuse races | Interrupted post-transition cleanup is retried only for explicitly requested cancellations | Existing unique token index used directly; no migration required |
| SEC-2026-08-006 | FIXED | `fix(auth): harden email change cancellation` | 3 scanner GETs; 6 security-page unit; session and live-socket revocation | The raw capability necessarily appears once in the form action and is protected by no-referrer | GET is read-only; POST is explicit; operation-scoped lock ownership enforced |

Stage 0 status: **COMPLETED**. The security regression and whitespace checks passed, historical documents remain in place, and only this remediation directory was added.
