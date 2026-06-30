# Liotan Security Release Checklist

Перед публичным релизом пройти каждый пункт.

## Secrets
- [ ] В репозитории и ZIP нет `.env`.
- [ ] Все секреты живут только в Render Environment.
- [ ] JWT_SECRET и PRIVACY_HASH_SECRET имеют длину 64+ случайных символа.
- [ ] После случайной утечки секреты ротированы.

## Auth
- [ ] Регистрация требует email-код.
- [ ] Login требует пароль + email-код.
- [ ] Disposable/temp email домены блокируются.
- [ ] MX-проверка включена.
- [ ] Rate-limit auth/code endpoints включён.

## API
- [ ] `/users` закрыт authMiddleware.
- [ ] `/profile/:username` закрыт authMiddleware.
- [ ] Все приватные endpoints требуют JWT.
- [ ] CORS разрешает только реальные домены Liotan.

## Uploads
- [ ] EXE/скрипты/SVG/HTML заблокированы.
- [ ] ZIP/RAR/7Z разрешены.
- [ ] Большие файлы не грузятся в память Node.js.
- [ ] MAX_ATTACHMENT_SIZE_BYTES задан явно.
- [ ] Cloudinary folders scoped by username.

## Messages
- [ ] Private history paginated.
- [ ] Group history paginated.
- [ ] Dialog list не грузит всю историю в память.
- [ ] MongoDB индексы применены.

## Browser security
- [ ] CSP включён.
- [ ] X-Frame-Options deny.
- [ ] HSTS включён в production.
- [ ] nosniff включён.

## E2EE
- [ ] Сервер не получает plaintext сообщений/медиа в штатном сценарии.
- [ ] Технические E2EE статусы не показываются обычному пользователю.
- [ ] В следующем security-pass добавить key fingerprints и предупреждение о смене ключа.
