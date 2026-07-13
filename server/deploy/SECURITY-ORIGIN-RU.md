# Выделенный origin страниц безопасности

Ссылки «Это был не я» должны открываться на `https://security.liotan.com`, а не
на API-домене. Backend обслуживает только HTML действий и внешний
`/security/security-pages.css`; формы остаются same-origin и защищены CSP.

## Перед следующим deployment

1. В `/home/liotan/apps/Liotan-deploy/shared/server.env` добавить:

   ```env
   PUBLIC_SECURITY_URL=https://security.liotan.com
   API_ALLOWED_HOSTS=api.liotan.com,api.liotan.ru,security.liotan.com
   ```

2. В Cloudflare Zero Trust → Networks → Tunnels → Public Hostnames создать
   hostname `security.liotan.com` с service `http://127.0.0.1:3001` — тем же
   локальным backend, но отдельным публичным hostname.
3. Для hostname оставить TLS в режиме Full (strict), не включать Cache Everything,
   Rocket Loader, Zaraz или автоматический Browser Insights/Web Analytics.
4. После deployment проверить без токена только CSS (страницы с токеном нельзя
   публиковать в логах или CI):

   ```bash
   curl --fail --silent --show-error \
     -H 'Host: security.liotan.com' \
     -H 'X-Forwarded-Proto: https' \
     http://127.0.0.1:3001/security/security-pages.css
   ```

`PUBLIC_SECURITY_URL` обязателен в production startup validation. Не добавляйте
`security.liotan.com` в CORS origins клиента: страницы не выполняют API-запросы и
не должны становиться новым origin мессенджера.
