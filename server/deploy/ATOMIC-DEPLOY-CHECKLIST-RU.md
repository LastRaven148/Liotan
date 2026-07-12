# Атомарный deployment Liotan 50.1.0

Deployment не запускается из pull request. Workflow `Deploy production` получает
артефакт только после успешного CI на `main` и должен быть защищён GitHub
Environment `production` с обязательным ручным подтверждением.

## GitHub variables

- `DEPLOY_ROOT=/home/liotan/apps/Liotan-deploy`
- `PM2_PROCESS=liotan-api`
- `HEALTH_URL=http://127.0.0.1:3001/health`
- `FRONTEND_SMOKE_URL=http://127.0.0.1:8080`
- `FRONTEND_HOST=tunnel.liotan.com`
- `PUBLIC_FRONTEND_LINK=/var/www/liotan`

Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_HOST_KEY`.

## Однократная подготовка VPS

1. `/var/www/liotan` должен быть символической ссылкой на
   `/home/liotan/apps/Liotan-deploy/current/client/build`. Нельзя создавать её
   через `readlink -f current`: это навсегда закрепит Nginx за одной старой
   ревизией и разрушит атомарное переключение.

   Безопасное создание или исправление ссылки:

   ```bash
   sudo ln -s /home/liotan/apps/Liotan-deploy/current/client/build /var/www/liotan.next
   sudo mv -Tf /var/www/liotan.next /var/www/liotan
   readlink /var/www/liotan
   ```

   Последняя команда должна вывести путь с буквальным сегментом `/current/`, а
   не `/releases/<SHA>/`.
2. `/home/liotan/apps/Liotan-deploy/shared/server.env` принадлежит deploy-user и
   имеет режим `0600`.
3. Постоянные uploads находятся в `shared/uploads`; внутри release создаётся
   только ссылка на них.
4. Deploy-user имеет `node` 22, npm 10, `pm2`, `flock`, `curl` и право читать
   архив. Nginx имеет право прохода по родительским каталогам и чтения только
   `client/build`.
5. Скопировать `nginx-liotan-security-headers.conf` в
   `/etc/nginx/snippets/liotan-security-headers.conf`, установить основной
   template и проверить: `sudo nginx -t`, затем `sudo systemctl reload nginx`.

## Что проверяет installer

- блокирует параллельный deployment через `.deploy.lock`;
- до перезапуска PM2 требует, чтобы Nginx-ссылка следовала за общей `current`;
- отклоняет небезопасные пути архива;
- требует `client/build/index.html`, hashed JS и CoreCrypto WASM;
- устанавливает backend зависимости до переключения;
- сохраняет shared `.env` и uploads;
- одной атомарной заменой переключает `current` для frontend и backend;
- проверяет API health, содержимое активного `index.html`, hashed JS и MIME WASM;
- при любой ошибке возвращает `current` на предыдущий release и перезапускает PM2;
- сохраняет активный release и шесть предыдущих кандидатов для rollback.

## Ручной rollback

Deployment script выполняет rollback автоматически. Для аварийного ручного
возврата выберите проверенную ревизию и переключите только общую ссылку:

```bash
cd /home/liotan/apps/Liotan-deploy
ln -s /home/liotan/apps/Liotan-deploy/releases/<GOOD_SHA> current.rollback
mv -Tf current.rollback current
pm2 delete liotan-api || true
pm2 start current/server/server.js --name liotan-api --cwd current/server --time
pm2 save
curl --fail http://127.0.0.1:3001/health
curl --fail -H 'Host: tunnel.liotan.com' http://127.0.0.1:8080/
```

Не удаляйте `shared`, `.env`, uploads или предыдущий release до успешного smoke-test.
