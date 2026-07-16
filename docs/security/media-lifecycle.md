# Жизненный цикл E2EE-медиа

## Шифрование и upload

1. Клиент создаёт случайный 256-bit media key.
2. Файл делится на адаптивные chunks.
3. Каждый chunk шифруется AES-256-GCM со случайным 12-byte IV и AAD, связывающим conversation, binding, chunk index/count, plaintext size и тип.
4. Media key и authenticated manifest включаются в MLS-encrypted message envelope; отдельно на сервер они не отправляются.
5. Сервер принимает только формат `LIOTANMLS1`, проверяет framing, размеры, ciphertext hash, signed device request и conversation membership.

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

## URL и access control

Private media загружается и скачивается через authenticated `/crypto/v4/media/*`. Публичный URL bucket не является авторизацией. CSP разрешает только известные legacy/public origins для совместимости отображения; новые private attachments не должны передаваться как постоянный public object URL.

Cloudflare/R2 bucket policy, custom domains и access logs находятся вне репозитория и должны проверяться отдельно.

## Сбойные сценарии

- Abort/reload до message commit: объект остаётся temporary и затем очищается.
- Повтор upload/message: binding и ciphertext-bound idempotency не допускают замены payload.
- R2 delete failure: запись остаётся deletion-pending, message не возвращается.
- Ошибка MLS: media не может быть отправлено как plaintext fallback.
