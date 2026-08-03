# Remediation status

| ID | Status | Commit | Tests | Residual risk | Notes |
| --- | --- | --- | --- | --- | --- |
| SEC-2026-08-001 | FIXED | `fix(media): restore authorized MLS media download` | 49 integration; 2 attachment unit; media-storage and crypto-static gates | No known residual in tested route; live R2 was intentionally not accessed | Full/range/access/lifecycle/device/R2/quota paths covered |
| SEC-2026-08-002 | OPEN | — | Concurrency reproduction pending | One email code may authorize multiple operations | Every actual caller must be preserved |
| SEC-2026-08-003 | OPEN | — | Concurrency reproduction pending | Same TOTP step may be accepted concurrently | Duplicate read-modify-save implementations confirmed |
| SEC-2026-08-004 | OPEN | — | Concurrency reproduction pending | Same backup code may be accepted concurrently | Whole-array replacement confirmed |
| SEC-2026-08-005 | OPEN | — | 150-record reproduction pending | Valid cancellation can be missed | Unique token index is already present |
| SEC-2026-08-006 | OPEN | — | GET-mutation reproduction pending | Link scanners can cancel a change | GET is directly routed to mutating controller |

Stage 0 status: **COMPLETED**. The security regression and whitespace checks passed, historical documents remain in place, and only this remediation directory was added.
