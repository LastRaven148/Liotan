# Cloudflare Web Analytics / RUM beacon

Исходный код Liotan не подключает `static.cloudflareinsights.com/beacon.min.js`.
Security regression запрещает появление этого URL в `client/src`. CORS или CSP
не ослабляются ради beacon: ошибка его загрузки не связана с CoreCrypto.

Cloudflare документирует, что для proxied hostname beacon может автоматически
добавляться на edge при включённой автоматической установке Web Analytics/RUM.

Чтобы отключить инъекцию:

1. Cloudflare Dashboard → **Analytics & Logs → Web Analytics**.
2. Найдите hostname Liotan и выберите **Manage site**.
3. Для automatic setup выберите **Disable**. Это отключает JS injection.
4. Если RUM был включён из Observatory, официальный FAQ указывает: Web Analytics
   → **Manage Site** нужного hostname → **Delete**.
5. Очистите Cloudflare cache для HTML и проверьте View Source/Network в новой
   приватной сессии. В origin `client/build/index.html` beacon отсутствует.

Официальные источники:

- https://developers.cloudflare.com/web-analytics/get-started/
- https://developers.cloudflare.com/speed/observatory/faq/
- https://developers.cloudflare.com/speed/observatory/rum-beacon/
