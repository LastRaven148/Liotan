# Crypto/security regression tests

> [!WARNING]
> Historical document for the pre-remediation architecture.
> Superseded by `docs/security/remediation-2026-07-23/`.
> Do not use this document as the current production security specification.

## Категории команд

| Команда | Уровень | Назначение |
| --- | --- | --- |
| `npm run test:unit` | unit | криптографические primitives и coverage gate |
| `npm run test:integration` | integration | API, Mongo transactions, device/media/message lifecycle |
| `npm run test:crypto-static` | static AST | legacy imports, secret storage/logging, RNG и AES-GCM IV rules |
| `npm run test:crypto` | crypto | static, security, media и production CoreCrypto browser spec |
| `npm run test:security` | source/security | архитектурные fail-closed invariants |
| `npm run test:browser` | browser/E2E | production output и UI/MLS flows |
| `npm run test:e2e` | E2E alias | полная Playwright matrix |
| `npm run test:release` | release | build, installer, archive, bundle и release validation |
| `npm run test:all` | aggregate | tests, build, licenses и SBOM |

## Finding coverage

| Finding | Основное доказательство |
| --- | --- |
| F-01 stale operation | `stale self-update cannot clear...`, membership generation и parallel winner integration tests |
| F-02 legacy boundary | `securityRegression.js`, отсутствие listeners/imports/writes, v3 tombstones |
| F-03 devices/safety | pending approval integration, directory browser scenarios, safety UI production tests |
| F-04 media lifecycle | atomic media capability, cleanup idempotency и migration integration tests |
| F-05 duplicate ID | parallel ciphertext-bound winner integration test |
| F-06 cursor repair | production sync checkpoint cases: deleted/ahead/behind/reorder/rollback |
| F-07 recovery | production IndexedDB passphrase/migration/concurrency test |
| F-08 FS/PCS evidence | real CoreCrypto transaction/remove/past-epoch/out-of-order tests |
| F-09 roster semantics | exact operation intent/replay/expiry integration tests |
| F-10 media memory | 100 MB production encryption, OPFS cleanup и abort regression; fallback/decrypt memory остаётся документированным пределом |
| F-11 rollback | signed append-only directory plus encrypted highest-seen browser pin test |
| F-12 buffered metadata | fail-closed source invariant and production event validation tests |

## Обязательные positive regressions

Проверки не должны ослабляться ради прохождения suite:

- CryptoGate не пропускает Messenger при storage/CoreCrypto error.
- Production WASM загружается с правильным MIME и real package bytes.
- `Database.open` закрывается/повторно открывается; initialization single-flight.
- Device request signature привязана к method/path/body/timestamp/nonce.
- Nonce replay отклоняется.
- MLS/media ciphertext tamper и AAD mismatch отклоняются.
- Recovery/private keys отсутствуют в `localStorage`, API fixtures и logs.
- Legacy write routes остаются `410`.
- Message/media send не имеет plaintext fallback.

## Browser matrix

Полная команда `npm run test:browser` запускается для Chromium, Firefox и WebKit через `playwright.config.js`. CoreCrypto/WASM сценарии используют production build/preview, а не Vite dev server.

OPFS, profile clone, clipboard и non-extractable key поведение могут отличаться по browser/OS. Пропуск допускается только с явной причиной в отчёте; один успешный Chromium не является доказательством полной browser matrix.

## Migration regression

`crypto state migration removes the unsafe TTL index...` проверяет dry model на локальной MongoDB: удаление TTL, quarantine неоднозначных uploads, backfill roster/device/directory и повторный запуск. Production apply требует точного `LIOTAN_CRYPTO_MIGRATION_CONFIRM`; тест никогда не использует production data.
