# Corrections to the previous audit

The prior audit was useful as a backlog but contained factual and wording
errors. This remediation re-verified code at the audited SHA and records the
following corrections.

| Previous statement | Correct fact |
|---|---|
| Device request signing was located at `client/src/crypto/mls/requestSigning.jsx`. | That file did not exist. Related active logic was in `client/src/crypto/cryptoApi.jsx`; v2 logic now also uses `accountKeys.jsx`, `recoveryStore.jsx` and `deviceAuthProtocol.js`. |
| Login was at `client/src/components/auth/Login.jsx`. | The actual component was `client/src/components/LoginPage.jsx`. |
| `server/utils/durableMigration.js` was dead code. | It was and remains used by `server/scripts/migrateCryptoState.js`, integration tests, and the new versioned migrations. It was not deleted. |
| A “full” inventory contained 424 objects. | `git ls-files` at audited commit `558d9484...` contained 440 tracked files. Only `git ls-files` is used as the inventory source of truth. |
| Socket and session size values described the same limit. | They were distinct enforcement contexts and were re-verified separately before quota/session changes. |
| Media AAD contained plaintext size. | Actual chunk AAD contains protocol label, conversation ID, client message ID, binding ID, chunk index and chunk count. Plaintext size is encrypted descriptor metadata, not AAD. |
| Bare R2 encrypted objects exposed a nonce/IV prefix. | The R2 object contains only the fixed `LIOTANMLS1` magic and AES-GCM chunk ciphertext/tag blocks. `noncePrefix` is in the encrypted MLS descriptor, not the object. |
| Server, database, R2 and GitHub were shown inside one trusted domain. | They are separate trust domains. The corrected diagram is in `C_CRYPTO_V4_POST_REMEDIATION_MAP.md`. |
| All historical CodeQL wording described current results. | Alert counts and states were a dated snapshot. The matrix distinguishes concrete fixed sinks from the current GitHub branch scan/ruleset verification that is blocked by platform access. |
| Severity implied server-readable plaintext for all current media. | Active Crypto v4 media is encrypted client-side. The high risk was pre-body authorization/resource abuse and lifecycle accounting, not an R2 plaintext-media claim. |
| A narrow crypto-module coverage percentage represented project coverage. | It did not. Evidence is now split into unit, integration, browser, migration, static invariant, privacy, architecture, workflow and release suites. |
| Unreferenced modules were described simply as “unused.” | Removal is based on transitive unreachability from explicit production and operational entry roots; the complete import graph is enforced by `scripts/codeHealthAudit.js`. |

## Correct trust statement

The server observes routing, account/device identifiers, conversation
membership, timestamps, ciphertext sizes/hashes, upload/download activity and
directory public state. It does not receive new supported Crypto v4 message
plaintext or media keys through the normal protocol. MongoDB and private R2
remain sensitive metadata/ciphertext systems, not “untrusted harmless storage.”
GitHub and the deployment edge are supply-chain/operational trust domains.

## Correct CodeQL statement

The remediation does not claim that CodeQL has no alerts. It fixes the concrete
path, dynamic property/query, release TOCTOU and insecure-temporary-file sinks
reproduced in source and adds local workflow/code-health gates. Both CodeQL
checks pass on the remediation head without dismissing an alert. Read-only
inspection confirms that 33 historical high alerts remain open on `main` and
that branch protection previously required `analyze`, not the aggregate
`CodeQL` alert gate. On 2026-07-24 the aggregate context was added without
removing any existing required check. The historical baseline still requires
deliberate triage; no alert was dismissed to obtain a green check.
