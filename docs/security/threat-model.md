# Threat model Liotan E2EE

## Защищаемые свойства

Liotan стремится защищать:

- конфиденциальность message/media plaintext от API, Mongo, R2 и пассивного сетевого наблюдателя;
- целостность и sender authentication MLS messages;
- отсутствие plaintext fallback;
- сериализованную смену membership/device roster;
- обнаружение локально наблюдаемого directory/cursor rollback;
- безопасное удаление временных/orphan media;
- невозможность тихо переиспользовать `clientMessageId` для иного ciphertext.

## Доверенные компоненты

- неизменённый официальный клиентский bundle;
- браузер WebCrypto, IndexedDB/OPFS и same-origin isolation;
- CoreCrypto 10.0.0/WASM;
- устройство пользователя и его локальный профиль в момент использования;
- корректная проверка подписей/transactions на API.

## Учитываемые атакующие

- пассивный сетевой наблюдатель;
- R2/Mongo reader без client keys;
- повтор/перестановка/подмена API payload;
- stale/replayed pending operation;
- legacy event injection в v4 UI;
- rollback server data при наличии локального highest-seen pin;
- украденная/revoked auth session;
- malformed/tampered encrypted media.

## Не входит в threat model

- **Malicious frontend/XSS/extension:** JavaScript того же origin во время работы способен читать plaintext, passphrase и recovery key до/после WebCrypto. CSP, supply-chain и release controls снижают риск, но не превращают браузер в доверенный enclave.
- Полная компрометация ОС/браузера или активного endpoint.
- Компрометация account root/recovery key.
- Traffic-analysis и server metadata: participants, timings, sizes, device/IP/session metadata частично видимы серверу.
- Availability: сервер/Cloudflare/VPS может блокировать, задерживать или удалять ciphertext.
- Первый контакт на чистом профиле без независимого transparency witness.

## Recovery storage

Version 1 оборачивает recovery key non-extractable AES key из IndexedDB. Это защищает от простого пассивного чтения record store, но не от копирования полного browser profile или same-origin script.

Version 2 добавляет локальную passphrase: PBKDF2-SHA-256, 600000 iterations, random salt, inner AES-GCM и внешнюю обёртку non-extractable IndexedDB key. Миграция staged/resumable; unlock single-flight; passphrase сервер не получает.

**Подтверждено browser test:** raw IndexedDB dump не содержит literal recovery key; неверная passphrase отклоняется; interrupted migration возобновляется.

**Ограничение браузера:** JavaScript strings нельзя гарантированно zeroize; browser/OS может делать копии памяти. Clipboard clearing best-effort и не является гарантией удаления из clipboard history/sync.

## Rollback

Directory и recipient cursor имеют локальные encrypted highest-seen records. Это обнаруживает откат сервера для существующего browser profile. Восстановление одновременно старого Mongo snapshot и старого/клонированного browser profile может обойти локальный monotonic pin. Внешний witness, hardware counter или transparency service пока отсутствует.

## FS/PCS

MLS update/remove обеспечивает защиту будущих epochs от удалённого клиента согласно CoreCrypto. Retention прошлых epochs зависит от библиотеки; тест 10.0.0 подтвердил возможность расшифрования как минимум двух прошлых epochs. Формулировка «старое сообщение немедленно невозможно расшифровать после update» запрещена.

## Инфраструктура

GitHub, npm registry, CI runner, Cloudflare, TLS termination и VPS являются supply-chain/deployment trust boundaries. Attestation, pinned dependencies, audits и atomic deployment нужны, но не доказывают отсутствие компрометации этих систем.
