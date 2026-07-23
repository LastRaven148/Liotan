# Test evidence

## Environment and source

- Node.js: `22.22.3`
- npm: `10.9.8`
- OS: Windows, PowerShell; Bash is used only by the deployment-installer
  regression.
- Audited/base SHA:
  `558d9484a4c72885ed2332471f8672736cd141d2`
- Final acceptance is run only from a clean committed remediation tree.

Lockfile SHA-256 values used before and after every clean run:

| Lockfile | SHA-256 |
|---|---|
| `package-lock.json` | `58F24F57ADA2DDE67B60455B7F985542E7E23D00B04262B93B89B6BE14484124` |
| `client/package-lock.json` | `0DAB0198B82FF5EA45E7874FB24FDE4DA924A3EB6DAD1BEEF66564416D658F38` |
| `server/package-lock.json` | `39608DB1DF95BB502B32233F0109906E29AD2349EEF5A79C57C60A14DC36A249` |

## Baseline evidence

At audited SHA `558d9484...`:

- root, client and server `npm ci` completed;
- client and server production dependency audits were clean;
- root audit reported two high transitive advisories:
  `brace-expansion` and `fast-uri`;
- the original `npm test` functional suites passed and then failed the
  deployment-bundle check when a client build had not been created first;
- the baseline official release gate passed functional, browser, build,
  reproducibility, license and SBOM stages and failed the root dependency audit.

This is why `package.json` now builds before bundle inspection and why the two
transitive advisories were updated.

## Remediation suite architecture

| Suite | Command/gate | Security purpose |
|---|---|---|
| Server unit | `npm run test:unit --prefix server` | Parsing, signatures, mutation chain, session/device binding, middleware order, proxy, CSP, avatar and input guards. |
| Server integration | `npm run test:integration --prefix server` | Mongo-backed MLS/device/media/quota/deletion/migration races and replay behavior. |
| Client/browser | `npm run test:browser` | Chromium, Firefox and WebKit production bundle, MLS/WASM, IndexedDB, mobile layout and settings behavior. |
| Crypto invariants | `npm run test:crypto-static`, browser MLS cases | No legacy/private-key/plaintext fallback, envelope/media/device/transparency invariants. |
| Migration | integration migration cases | Durable lease, resume, idempotence, cutoff, dry-run and object-before-metadata behavior. |
| Security regression | `npm run test:security` | Static locks for every critical remediation invariant and intentional deletion. |
| Media storage | `npm run test:media-storage` | Ciphertext magic/hash/streaming and managed temp cleanup without path exposure. |
| Architecture/dead code | `npm run audit:architecture`, `npm run audit:code-health` | Executable flows and complete relative-import reachability from supported roots. |
| Privacy | `npm run audit:privacy`, `npm run audit:e2ee-replies` | Metadata/plaintext leakage and reply path checks. |
| VPS/workflows | `npm run audit:vps`, `npm run audit:workflows` | Proxy/deploy invariants, action pins, permissions and provenance. |
| Release/supply chain | `npm run release:check` | Clean installs, syntax/build, all tests, dependency audits, license, SBOM and reproducible artifacts. |

The coverage command intentionally reports only its named crypto primitive
modules. It is not described as project-wide line coverage.

## Targeted results before final acceptance

- Server unit: 28 passed, 0 failed.
- Server integration: 42 passed, 0 failed.
- WebKit responsive layout after stabilization: 10/10 repeated passes.
- Security regression: pass.
- Crypto static analysis: pass.
- Media storage regression: pass.
- VPS audit: zero findings.
- Workflow permission/provenance audit: pass.
- Code-health graph at the evidence checkpoint: all production modules
  reachable and `durableMigration.js` reachable from operational migrations.
- Root/client/server fresh installs: zero reported dependency vulnerabilities
  after the lockfile remediation.

## Failed-run disclosure and fixes

No failed run is relabeled as a pass.

### Managed media regression

The first fresh-install candidate run found that
`scripts/mediaStorageRegression.js` still read `accepted.result.path` after
production storage had deliberately replaced path exposure with trusted
`openReadStream()`/`removeManagedFile()` closures. It failed before completing
the release gate.

Fix `d2fad6c` makes the test assert the closure contract, assert absence of a
path, and clean up in `finally`. The leaked 76-byte test artifact from the
failed assertion was removed only after validating the exact managed temp
directory, filename pattern and size.

### WebKit responsive fixture

The next candidate run passed 110 of 111 browser tests and failed one WebKit
mobile geometry assertion with a detached node width of zero. The fixture had
called `createRoot()` twice on one container and measured immediately after a
concurrent render.

Fix `ff13e65` reuses one root and commits the desktop-to-mobile fixture render
with `flushSync`. The exact WebKit case then passed 10 consecutive repetitions.

### Dependency evidence synchronization

The first final-tree candidate run passed all 111 browser tests and all
security/privacy/dependency audits, then the clean-release guard rejected the
tree. License/SBOM generation had correctly updated two tracked artifacts that
still described the pre-remediation `brace-expansion 2.1.1` and
`fast-uri 3.1.3` even though the lockfile used patched 2.1.2/3.1.4.

Commit `8396771` synchronizes those generated artifacts with the audited
lockfile. License policy and two independent SBOM generations pass and produce
identical component hashes. The failed candidate is not counted as a clean run.

## Final clean-run protocol

Publication is permitted only after two consecutive runs on the final
documentation SHA. Each run:

1. requires empty `git status --porcelain`;
2. captures HEAD and all three lockfile hashes;
3. runs `npm ci`, `npm ci --prefix client`, and
   `npm ci --prefix server`;
4. runs `npm run release:check`;
5. compares all lockfile hashes;
6. requires empty `git status --porcelain` again;
7. writes an external aggregate status JSON without secrets or user data.

`release:check` covers architecture, import/dead-code graph, workflow
permissions, CSS/build reproducibility, client build, all server/client/browser
tests, coverage scope, deployment bundle, license, SBOM and SBOM
reproducibility, all dependency audits, privacy/E2EE/VPS audits, release ZIP
reproducibility, checksum and exact source manifest.

The exact final HEAD, timestamps, two PASS records and run order are copied into
the Draft PR body after execution. Logs stay outside the repository because
they contain machine-local paths and browser trace locations; they contain no
production access or production data.
