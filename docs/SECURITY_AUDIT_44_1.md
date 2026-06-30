# Liotan 44.1 Security Audit

## Проверено и исправлено

### Secrets
- Удалён `server/.env` из проекта.
- Удалён ошибочный `server/.evn.exapmle`.
- Обновлён `server/.env.example` без реальных секретов.

### Auth / Email
- Добавлен `server/utils/emailRisk.js`.
- Регистрация и смена email теперь проходят через email-risk проверку.
- Блокируются известные disposable/temp email домены.
- Блокируются подозрительные TLD.
- Включена MX-проверка домена почты через `EMAIL_REQUIRE_MX=true`.
- Добавлен `BLOCKED_EMAIL_DOMAINS` для ручного расширения чёрного списка.

Ограничение: браузер/сервер не может достоверно узнать возраст конкретного почтового ящика Gmail/Outlook/Yandex. Можно проверять только домен, MX, disposable reputation и дополнительные внешние risk API в будущем.

### Non-auth access
- `/users` закрыт `authMiddleware`.
- `/profile/:username` закрыт `authMiddleware`.
- Незалогиненный пользователь больше не должен получать список пользователей или профили.

### Headers / Browser security
- Включён CSP вместо `contentSecurityPolicy: false`.
- Включён `frameguard: deny`.
- Включён `no-referrer`.
- HSTS включается в production.
- Static uploads продолжают отдавать `nosniff`; attachments отдаются как download.

### Upload security
- Большие attachments больше не грузятся через `multer.memoryStorage()`.
- Attachments теперь пишутся во временный файл и удаляются после upload.
- Default лимит attachments снижен со 100 MB до 50 MB.
- `.exe` и скриптовые/HTML/SVG форматы заблокированы.
- Разрешены архивы `.zip`, `.rar`, `.7z`.
- `.tar` и `.gz` не добавлены.
- `application/octet-stream` разрешён только для E2EE `.liotan*` файлов или архивных расширений.
- Добавлена проверка magic bytes для PNG/JPG/WebP/PDF/ZIP/7Z/RAR.
- Cloudinary upload folders теперь scoped по username.

### Pagination / Load
- `getChat` теперь отдаёт пачку до 100 сообщений, default 50.
- `getGroupChat` теперь отдаёт пачку до 100 сообщений, default 50.
- REST group history тоже paginated.
- Dialog list переписан на Mongo aggregation: больше не тянет всю историю пользователя в память Node.

### Mongo indexes
- Добавлены индексы под private history, group history, dialogs и unread/status.

### Socket.IO
- Socket auth уже требовал JWT + active session.
- `typing` теперь проверяет существование verified-пользователя перед emit.
- History events больше не отдают всю историю.

### Rate limits
- Production limits ужесточены:
  - auth: 12 / 15 мин;
  - email code: 3 / мин;
  - upload: 12 / 15 мин;
  - API: 1200 / мин;
  - E2EE: 300 / мин.

### Dependencies
- Server `nodemailer` обновлён до версии без известных npm audit уязвимостей.
- Server `npm audit --omit=dev`: 0 vulnerabilities.
- Client build успешен.

## Что осталось после 44.1

### Client dependencies
CRA/react-scripts тянет dev/build-time vulnerabilities через старые зависимости. Production bundle собирается успешно, но стратегически нужно перейти с CRA на Vite.

### E2EE key verification
Сервер уже не должен видеть plaintext в штатном сценарии, но для уровня Signal нужно добавить:
- device fingerprints;
- предупреждение при смене ключей;
- manual/QR key verification;
- trusted-device history.

### Load test
Полный нагрузочный тест 100+ реальных пользователей требует staging MongoDB/Render и отдельного скрипта, который будет открывать WebSocket-сессии и выполнять регистрацию/логин/сообщения. Внутри локального ZIP без production DB можно проверить только архитектурные узкие места и сборку.
