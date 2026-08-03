# Remediation status

| ID | Status | Commit | Tests | Residual risk | Notes |
| --- | --- | --- | --- | --- | --- |
| SEC-2026-08-001 | OPEN | — | Source-level reproduction pending | Authorized media downloads fail at runtime | Three missing bindings confirmed in current source |
| SEC-2026-08-002 | OPEN | — | Concurrency reproduction pending | One email code may authorize multiple operations | Every actual caller must be preserved |
| SEC-2026-08-003 | OPEN | — | Concurrency reproduction pending | Same TOTP step may be accepted concurrently | Duplicate read-modify-save implementations confirmed |
| SEC-2026-08-004 | OPEN | — | Concurrency reproduction pending | Same backup code may be accepted concurrently | Whole-array replacement confirmed |
| SEC-2026-08-005 | OPEN | — | 150-record reproduction pending | Valid cancellation can be missed | Unique token index is already present |
| SEC-2026-08-006 | OPEN | — | GET-mutation reproduction pending | Link scanners can cancel a change | GET is directly routed to mutating controller |

Stage 0 status: **COMPLETED**. The security regression and whitespace checks passed, historical documents remain in place, and only this remediation directory was added.
