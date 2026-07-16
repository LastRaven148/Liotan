# Граница legacy v3 и MLS v4

## Production policy

Liotan 50.1.0 является v4-only runtime для новых сообщений. Исполняемый клиентский модуль v3 удалён. Официальный UI не подписывается на legacy message/history/edit/delete/pin Socket.IO events и не вызывает legacy writes.

Legacy endpoints identity, identity backup и conversation private key остаются зарегистрированными только как постоянный tombstone и отвечают `410 Gone` / `mls-v4-required`. Возвращать их рабочее поведение запрещено.

## Старые данные

Старые Mongo models и некоторые read/delete пути могут существовать для:

- controlled account deletion/export;
- инвентаризации;
- quarantine и ручного migration решения.

Их наличие не означает, что payload доверен MLS UI. `CryptoConversation` является источником v4 dialog metadata; legacy `Messages` не используется для MLS history или last-message content.

Текущая безопасная политика строже варианта read-only container: legacy plaintext/v3 history вообще не смешивается с Messenger MLS timeline. Если в будущем потребуется просмотр, он должен быть отдельным явно непроверенным интерфейсом и не может использовать MLS message component, replies, pins или verified sender semantics.

## Downgrade и injection

Для MLS conversation:

- `protocolVersion=v3` fail-closed;
- legacy `newMessage/chatHistory` игнорируются клиентом;
- legacy edit/delete/pin не воздействуют на MLS event log;
- только `/crypto/v4/conversations/*/events` создаёт trusted message object;
- buffered plaintext без исходной immutable event metadata отклоняется.

**Подтверждено кодом и static regressions:** отсутствует production legacy import/send path; socket listeners и dialog controller не читают legacy message content; v3 routes остаются tombstones.

**Остаточный риск:** скомпрометированный сервер может скрывать, задерживать или переставлять доступные ciphertext events в пределах обнаруживаемых правил, но не должен иметь возможности создать CoreCrypto-authenticated plaintext от честного sender.
