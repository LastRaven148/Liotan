# Stage 0–1 execution plan

The order is intentionally dependency-aware. Each substage receives targeted tests, status/evidence updates, and a separate local commit before work continues.

1. Restore authorized MLS encrypted-media download and add route-level R2/quota/access regressions.
2. Introduce correct email-code storage, expiry, attempt, reservation, and consumption semantics across every caller and migration/index coverage where required.
3. Introduce one shared atomic TOTP and backup-code consumption service and migrate authentication/recent-auth callers to it.
4. Replace bounded email-change token scanning with an indexed atomic transition and split confirmation GET from mutating POST.
5. Run the complete local unit, integration, security, crypto/media, migration, build, deployment-bundle, browser, and production-dependency audit gate.
6. If the repository release policy requires it, apply exactly one synchronized patch bump and repeat version/release verification.

No later substage begins while its predecessor's targeted tests are failing.
