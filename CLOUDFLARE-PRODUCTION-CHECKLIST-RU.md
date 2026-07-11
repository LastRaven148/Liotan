# Cloudflare checklist для Liotan MLS E2EE

## R2

- Создайте **два разных bucket**: приватный для ciphertext-медиа и публичный
  только для аватаров.
- У приватного media bucket выключите `r2.dev` и удалите все public custom
  domains. Проверьте это именно в Dashboard: исходный код не может доказать
  фактическую публичность bucket. Для `r2.dev` можно дополнительно выполнить
  `npx wrangler r2 bucket dev-url disable <PRIVATE_MEDIA_BUCKET>` и затем снова
  проверить статус в Dashboard; custom domains отключаются отдельно.
- Выпустите два разных API token, каждый с доступом только к своему bucket.
  Media token не должен иметь права на avatars и наоборот.
- Не добавляйте CORS/public read policy к media bucket. Node API читает его по
  S3 API и передаёт ciphertext потоково только после cookie + device-signature
  проверки.
- Включите lifecycle rule для удаления незавершённых/осиротевших объектов после
  согласованного срока; сначала запускайте `cleanup:r2-detached` в dry-run.

## DNS, Tunnel и origin

- Проксируйте frontend и API через Cloudflare. Node слушает только
  `127.0.0.1:3001`; прямой inbound к 3001 закрыт firewall.
- Предпочтителен Cloudflare Tunnel. Если origin публичный — TLS `Full (strict)`,
  Origin Certificate и Authenticated Origin Pulls; разрешите 80/443 только с
  Cloudflare IP.
- Оставьте WebSockets включёнными. Не кэшируйте `/socket.io/*`, `/auth/*`,
  `/crypto/*`, `/attachments/*`, `/security/*` и ответы API вообще.
- Minimum TLS 1.2, TLS 1.3 включён, HSTS после проверки всех поддоменов.

## Frontend integrity

- Для `index.html`: `Cache-Control: no-store` либо короткий revalidate. Для
  хэшированных `/assets/*.js`, `/assets/*.css`, `/assets/*.wasm`:
  `public, max-age=31536000, immutable`.
- `.wasm` обязан отдаваться с `Content-Type: application/wasm`; HTML fallback
  для отсутствующего WASM запрещён.
- Установите CSP из `server/deploy/nginx-liotan-api.conf`. Критичны
  `script-src 'self' 'wasm-unsafe-eval'`, `object-src 'none'` и
  `frame-ancestors 'none'`.
- Не подключайте на app-origin Zaraz, Rocket Loader, Browser Insights, Google
  Tag Manager, live-chat/support widgets, A/B testing, сторонние analytics и
  любые remote scripts. Такой JavaScript имеет тот же доступ к plaintext, что и
  клиент Liotan.
- Выключите автоматическое переписывание/minify JavaScript на Cloudflare.
  Деплойте только проверенные хэшированные артефакты из `npm ci`.

## WAF, логи и метаданные

- Rate limit для login/code/reset и upload уже есть в приложении; продублируйте
  грубый edge-limit, но не создавайте challenge на WebSocket и нормальный MLS
  polling.
- Ограничьте body для JSON API; media upload допускайте до значения
  `MAX_ENCRYPTED_MEDIA_SIZE_BYTES` плюс небольшой multipart overhead.
- Не логируйте request bodies, crypto headers, cookies и query strings в Workers,
  Logpush, SIEM или сторонние APM. Conversation IDs, timing и размеры — тоже
  чувствительные метаданные.
- Не используйте Worker, который может модифицировать JS/WASM или API bodies.
  Если Worker неизбежен, зафиксируйте код, ограничьте доступ и включите отдельный
  review/audit trail.

## Перед переключением traffic

1. Зафиксируйте неизменяемый `LIOTAN_CRYPTO_DOMAIN`.
2. Проверьте MongoDB replica set и транзакции.
3. Выполните `npm ci` во всех трёх package roots и `npm run release:check`.
4. Проведите тест: два аккаунта, два устройства у каждого, private/group media,
   offline delivery, add/remove/revoke, logout-all и password reset.
5. Сверьте safety number между двумя аккаунтами по независимому каналу.
6. Закажите независимый аудит клиента, API и конфигурации Cloudflare. Только
   после этого называйте релиз externally audited E2EE.
