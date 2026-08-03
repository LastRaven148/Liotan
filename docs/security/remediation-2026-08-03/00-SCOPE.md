# Liotan security remediation scope — 2026-08-03

Status: **CURRENT REMEDIATION WORKSPACE**

## Baseline

- Workspace: `C:\Users\user\Desktop\Liotan`
- Local branch: `codex/security-remediation-stages-0-1-2026-08-03`
- Baseline SHA: `1c50c64491e622f441684903b5a945b9c1342214`
- Baseline version: `57.4.4`
- Verification date: 2026-08-03 (Europe/Moscow)

## In scope

- Evidence-backed remediation documentation for stages 0–1.
- MLS encrypted-media download runtime restoration and route-level regression coverage.
- Atomic email-code attempt tracking, expiry enforcement, replacement, and one-time consumption across every caller.
- Atomic TOTP-step and backup-code consumption through one shared primitive.
- Indexed and atomic email-change cancellation, with GET used only for confirmation and POST used for mutation.
- Local unit, integration, security, migration, build, and browser verification.
- Local commits and one synchronized patch-version bump if repository policy requires it.

## Out of scope

- CORS, CSRF, rate-limit, CI, Dependabot, deployment-architecture, Docker, or Node 24 changes.
- Refactoring or decomposing `server/deploy/install-release.sh`.
- Removal or relocation of historical audit/remediation documents.
- Dependabot branch or pull-request maintenance.
- Production data cleanup or migration execution.

## Safety boundaries

- No production MongoDB, R2, VPS, SSH, deployment, production secrets, or live-infrastructure testing.
- No work outside the workspace and no repository copies, clones, worktrees, or external backups.
- No destructive Git cleanup or reset operations.
- No load, stress, or DDoS testing.
- No fetch, pull, push, or remote-branch mutation.
