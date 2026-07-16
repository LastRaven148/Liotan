# Жизненный цикл криптографического устройства

## Регистрация

Устройство создаёт локально:

- CoreCrypto client/device identity;
- Ed25519 request signing key;
- root key только при первом создании account crypto identity;
- подписанный device manifest с сроком действия.

Private/request/root/recovery keys серверу не передаются. Сервер получает публичные ключи, commitments, manifest и подписи.

Первое устройство пустой identity активируется как `initial`. Если уже есть активное устройство, новое регистрируется как `pending` и не получает доступ к conversation events.

## Approval нового устройства

Активное существующее устройство получает pending device и одноразовый challenge. Approval связывает account, approving client, pending client/device, challenge и directory update. Запрос подписан request key approving device, а directory update — account root key.

Запрещены:

- self-approval;
- approval revoked/expired device;
- повтор challenge;
- cross-account/cross-device signature;
- использование pending device в MLS до activation.

**Подтверждено тестом:** pending device не может само себя одобрить; корректная подпись существующего устройства активирует его один раз.

## Recovery bootstrap

Если активных устройств не осталось, recovery не маскируется под обычный approval. Пользователь явно выбирает recovery/re-provision flow, подтверждает recovery key локально и root-подписывает directory action `recovery-bootstrap`.

Recovery key не запрашивается при обычном refresh/session restore. Он нужен при первой identity, действительно новом устройстве без approval или явном recovery flow.

## Safety number

Safety number строится симметрично для пары accounts и связывает:

- оба account root fingerprints;
- текущие directory versions/hashes.

Добавление, отзыв или восстановление устройства меняет directory и safety number. UI показывает grouped text и QR payload. Сканирование выполняет точное локальное сравнение; сервер не объявляет контакт verified.

Состояния UI:

- `first contact / TOFU` — ключ увиден впервые;
- `changed` — pin или directory изменились;
- `verified` — пользователь явно сравнил номер независимым каналом.

**Ограничение браузера:** verified/pin хранится локально зашифрованно и не переносится автоматически на чистый профиль.

## Revoke

Revoke требует подтверждения пользователя, device-signed request и root-signed directory update. Сервер атомарно переводит устройство в `revoked`, удаляет его key packages, увеличивает roster generation для затронутых conversations, включает epoch block, отзывает связанную auth session и отключает socket.

Одно оставшееся активное устройство нельзя случайно отозвать обычной кнопкой: нужен явный recovery acknowledgement. После revoke новые сообщения запрещены до успешного remove/reconcile commit.

**Подтверждено тестом:** старая pending operation не снимает block; revoked device не проходит auth; его session/socket закрываются; removed CoreCrypto client не расшифровывает новую epoch.

## Expiry и обслуживание

Manifest expiry проверяется независимо от signed directory status. Просроченное устройство отклоняется и conversations блокируются до reconcile. Directory commitment не переписывается серверным производным маркером `expired`, чтобы сервер не мог незаметно изменить root-signed log.

## Оставшиеся риски

- Компрометированный активный device/root key способен подписать вредоносное изменение directory.
- Чистый профиль не обнаруживает server rollback без внешнего witness.
- Название устройства и last-seen — server metadata, не криптографическая аттестация ОС.
- Root/recovery операции выполняются JavaScript-клиентом; malicious frontend видит введённый секрет.
