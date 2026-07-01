# Liotan 45.0 Structural Refactor

## Цель

45.0 — техническая нормализация проекта после миграции на Vite и стабилизации деплоя. Обновление не добавляет новые пользовательские функции. Главная задача — уменьшить крупные файлы, разделить ответственность и убрать старые артефакты.

## Что изменено

### Client

- `settings.css` разделён на базовый файл настроек и `settings-controls.css`.
- `MessageAudio.css` разделён на:
  - `MessageAudio.css` — аудио-сообщение внутри чата;
  - `MessageAudioTopbar.css` — верхний аудио-бар;
  - `MessageAudioResponsive.css` — tablet/mobile адаптация аудио.
- `App.css` и `messages.css` обновлены под новые CSS-модули.
- Удалён старый CRA `client/public/index.html`, потому что Vite использует `client/index.html`.

### Server

- `server.js` уменьшен до bootstrap-файла.
- Express-приложение вынесено в `server/app.js`.
- CORS-конфигурация вынесена в `server/config/corsOptions.js`.
- Проверка env и загрузка `.env` вынесены в `server/config/env.js`.
- Создание upload-директорий вынесено в `server/startup/ensureUploadDirs.js`.
- Очистка legacy-аккаунтов вынесена в `server/startup/cleanupLegacyAccounts.js`.
- `/health` вынесен в отдельный route `server/routes/healthRoutes.js`.
- Удалён старый ошибочный файл `server/.evn.exapmle`.

## Проверки

- `client npm run build` — успешно.
- `server node -c` по всем JS-файлам — успешно.
- `server app require smoke check` — успешно.
- Файлов больше 800 строк в `client/src` и `server` не осталось.

## Правило на будущее

Если файл приближается к 800 строкам — сначала выносить логику/стили в отдельный модуль, и только потом добавлять новую функциональность.
