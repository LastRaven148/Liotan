# Жизненный цикл E2EE-медиа

> [!WARNING]
> Historical document for the pre-remediation architecture.
> Superseded by `docs/security/remediation-2026-07-23/`.
> Do not use this document as the current production security specification.

## Шифрование и upload

1. Клиент создаёт случайный 256-bit media key.
2. Файл делится на адаптивные chunks.
3. Файл получает случайный 8-byte `noncePrefix`; IV каждого AES-256-GCM chunk равен `noncePrefix || uint32be(chunkIndex)`. AAD связывает protocol label, conversation, client message, binding и chunk index/count. Plaintext size находится в зашифрованном descriptor, а не в AAD.
4. Media key и authenticated manifest включаются в MLS-encrypted message envelope; отдельно на сервер они не отправляются.
5. Сервер принимает multipart только с ciphertext-файлом. Binding metadata существует в единственном canonical `X-Liotan-Crypto-Body`, входит в device signature и проверяется до Multer; любые дублирующие multipart-поля отклоняются.
6. Сервер проверяет формат `LIOTANMLS1`, framing, размеры, ciphertext hash и conversation membership.

Bare R2 framing содержит magic `LIOTANMLS1` и ciphertext/tag blocks; media key и
`noncePrefix` находятся только в MLS-зашифрованном descriptor.

При наличии OPFS клиент пишет временный ciphertext в локальный файл, не удерживая все encrypted chunks в памяти. В fallback используется Blob. Параллелизм ограничен двумя chunks.

**Подтверждено тестом:** swap/reorder/tamper chunk или AAD ломает GCM verification; сервер/Mongo/R2 не получают media key/plaintext; plaintext upload отклоняется.

**Ограничение браузера:** OPFS доступен не во всех режимах/браузерах. Decrypt-to-display в 50.1.0 формирует bounded Blob целиком; установлен server/client size limit 100 MB. Это снижает, но не устраняет O(file size) память на download.

## Capability и состояния

Upload создаёт запись `temporary` с:

- случайным commit token и delete token, на сервере только их hashes;
- owner/device/conversation binding;
- ciphertext hash и `clientMessageId` binding;
- коротким expiry для неуспешной отправки.

Принятие message и перевод media в `committed` выполняются в одной Mongo transaction. Только точное совпадение capability, message binding, owner, conversation и ciphertext hash может commit upload. У committed media `expiresAt=null`; общий TTL не удаляет пользовательское вложение.

Удаление message переводит объект в `deletion-pending`. R2 cleanup идемпотентен: после успешного удаления исчезает запись; при ошибке сохраняются attempts/error timestamp и выполняется retry.

## Cleanup

Cleanup обрабатывает только доказуемые состояния:

- истёкшие `temporary`;
- `deletion-pending`.

`committed` и `legacy-unverified` автоматически не удаляются. Неоднозначные старые MLS uploads migration переводит в quarantine `legacy-unverified` и снимает expiry.

**Подтверждено тестом:** failed message оставляет temporary upload для cleanup; успешный message commit сохраняет attachment; cleanup повторяем; migration удаляет старый опасный TTL index и идемпотентна.

В 57.4.0 активная quota reservation больше не имеет TTL deletion. `expiresAt`
задаёт время обработки worker-ом, а `purgeAt` появляется только после terminal
settlement. Lease/CAS worker освобождает active bytes и `reservedObjectCount`
ровно один раз; historical minute/hour/day usage не уменьшается. Stale
`uploaded` avatar после grace либо активируется по точной owner reference и
наличию объекта в public-avatar storage, либо переводится в retryable
deletion/dead-letter lifecycle.

## URL и access control

Private media загружается и скачивается через authenticated `/crypto/v4/media/*`. Публичный URL bucket не является авторизацией. CSP разрешает только известные legacy/public origins для совместимости отображения; новые private attachments не должны передаваться как постоянный public object URL.

Cloudflare/R2 bucket policy, custom domains и access logs находятся вне репозитория и должны проверяться отдельно.

## Сбойные сценарии

- Abort/reload до message commit: объект остаётся temporary и затем очищается.
- Повтор upload/message: binding и ciphertext-bound idempotency не допускают замены payload.
- R2 delete failure: запись остаётся deletion-pending, message не возвращается.
- Ошибка MLS: media не может быть отправлено как plaintext fallback.
