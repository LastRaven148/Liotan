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
