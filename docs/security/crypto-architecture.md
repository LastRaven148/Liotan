# Криптографическая архитектура Liotan 50.1.0

## Статус утверждений

В документах этого каталога используются следующие метки:

- **Подтверждено тестом** — гарантия воспроизводится автоматическим тестом Liotan.
- **Подтверждено кодом** — явный инвариант реализован, но не является доказательством корректности внешней библиотеки или всей среды исполнения.
- **Гарантия внешней библиотеки** — поведение зависит от CoreCrypto/OpenMLS и должно перепроверяться при обновлении зависимости.
- **Ограничение браузера** — гарантия зависит от same-origin, IndexedDB, OPFS, WebCrypto и защиты профиля браузером/ОС.
- **Не входит в threat model** — Liotan не способен устранить этот риск только прикладным E2EE-кодом.

## Компоненты и границы доверия

```text
UI
 └─ CryptoGate (fail closed)
     └─ LiotanMlsEngine
         ├─ CoreCrypto 10.0.0 + WASM
         ├─ постоянная CoreCrypto DB в IndexedDB
         ├─ зашифрованная локальная история/checkpoint
         └─ /crypto/v4/* + подписанные запросы устройства

API / WebSocket
 ├─ проверяет session и активное crypto device
 ├─ хранит opaque MLS ciphertext и серверную policy metadata
 ├─ сериализует операции изменения roster
 └─ не получает recovery key, media key или plaintext
```

CoreCrypto является единственным MLS engine. Liotan не реализует собственный ratchet, key schedule или MLS ciphertext. Официальный upstream: <https://github.com/wireapp/core-crypto>.

## Текстовые сообщения

1. UI передаёт plaintext только в локальный `LiotanMlsEngine`.
2. Engine требует готового MLS conversation; при block/reconcile/error отправка прекращается.
3. CoreCrypto создаёт MLS application ciphertext.
4. Клиент подписывает API request device request key.
5. Сервер проверяет membership, epoch, request signature, nonce и idempotency binding.
6. Сервер хранит и пересылает ciphertext с неизменяемой event metadata.
7. Получатель проверяет conversation, sequence, epoch, sender client ID, event type, ciphertext hash и `clientMessageId` до принятия результата расшифрования.

**Подтверждено тестом:** официальный send path не содержит Socket.IO/plaintext fallback; legacy write routes возвращают `410`; повторный `clientMessageId` с иным ciphertext/epoch отклоняется; параллельные одинаковые retries имеют одного победителя.

**Подтверждено кодом:** UI не допускается в Messenger до успешного открытия постоянной базы и инициализации MLS engine.

## Roster, epoch и pending operations

Сервер различает:

- `authorizedClientIds` — желаемый policy roster после account/device/membership правил;
- `activeClientIds` — roster, подтверждённый последним принятым MLS commit;
- `rosterVersion` — монотонная версия policy roster;
- `operationGeneration` — сериализованное поколение pending operation.

Operation фиксирует base roster/version/epoch, точные add/remove, ожидаемый resulting roster hash, initiator, expiry и generation. Commit принимается conditional update только при совпадении всех base predicates и result metadata. Stale, replayed, expired или semantic-mismatch commit не меняет epoch, roster и `blockedForEpochChange`.

**Подтверждено тестом:** отзыв устройства и удаление участника делают старую self-update/membership operation stale; из параллельных operations проходит только одно поколение; no-op вместо требуемого remove отклоняется.

Сервер не расшифровывает opaque MLS commit и не доказывает его внутреннюю семантику. Он ограничивает изменение собственной policy state точным intent. Фактическое криптографическое применение add/remove зависит от честного CoreCrypto-клиента и проверяется browser tests.

## Device directory и rollback detection

Account root Ed25519 key подписывает append-only directory statements. Каждый statement включает version, previous hash, hash набора device commitments, action, target, nonce и timestamp. Сервер хранит уникальную пару `(account, version)`, а клиент проверяет непрерывность относительно собственного highest-seen pin, который хранится в зашифрованном локальном store. API возвращает последние 1024 записи отдельно для каждого участника, а не общий обрезанный префикс. Чистый профиль проверяет root-подпись текущего head и доступный tail, но остаётся first-contact/TOFU.

**Подтверждено тестом:** Mongo snapshot, который возвращает directory к уже меньшей версии относительно локального pin, блокируется как rollback.

**Ограничение браузера:** чистый профиль без локального pin видит восстановленный snapshot как first contact. Для сильного обнаружения на новом профиле нужен независимый transparency witness/внешний monotonic anchor; его в 50.1.0 нет.

Если существующий профиль отстал более чем на 1024 directory transitions, continuity нельзя доказать одним ответом API, и клиент блокируется. Это преднамеренный fail-closed предел; автоматическое доверие усечённой цепочке запрещено.

## Cursor и локальная история

Зашифрованный per-device checkpoint является источником истины. `localStorage` содержит только недоверенный performance hint и не может продвинуть криптографический cursor. API возвращает authoritative recipient head. Recipient pages должны быть строго возрастающими, без duplicates/reorder, значений выше head и необъяснимой пустой страницы до head. Глобальные sequence gaps допустимы, когда промежуточные события адресованы другим получателям. Повреждение приводит к fail-closed, а не к общему удалению IndexedDB.

История хранится в отдельном IndexedDB store с compound cursor index и постраничным лимитом. Старый cache мигрируется пакетами после первого отображаемого окна; запись в старый и новый формат одновременно запрещена.

## FS/PCS: точная граница

Self-update по умолчанию планируется раз в 72 часа, допустимая настройка — 24–168 часов. Background maintenance обслуживает и неоткрытые диалоги при видимой/online вкладке. Removal-sensitive reconcile имеет приоритет и блокирует новые сообщения.

**Подтверждено тестом:** удалённый клиент не расшифровывает сообщения новой epoch; rollback CoreCrypto transaction не активирует новую epoch; out-of-order сообщения текущей epoch принимаются.

**Гарантия внешней библиотеки:** удаление past epoch secrets и окно out-of-order находятся внутри CoreCrypto/OpenMLS. Фактический тест CoreCrypto 10.0.0 показывает, что сообщения как минимум двух прошлых epochs ещё могут расшифровываться. Поэтому Liotan не обещает немедленное уничтожение всей прошлой epoch history. Upstream описывает retention как параметр группы: <https://book.openmls.tech/user_manual/group_config.html>.

PCS не действует против продолжающейся компрометации клиента, malicious same-origin JavaScript или подменённого production bundle.
