# Развёртывание командной версии

Эта папка подготовлена так, чтобы после подключения Cloudflare не требовалось менять бизнес-логику приложения.

## Что создаётся в Cloudflare

- один Workers Free Worker для API;
- одна D1 база `turnstile-inspection`;
- один Workers KV namespace `DOCUMENTS` для готовых PDF;
- один Durable Object class `InspectionRoom`;
- один Browser Run binding `BROWSER` для автоматической генерации PDF;
- один Cloudflare Pages project для PWA.

Платный Workers plan не требуется.

## Frontend

Cloudflare Pages:

- Production branch: `feature/turnstile-team-workflow` до финального merge, затем `main`;
- Build command: `bash turnstile-inspection/pages-build.sh`;
- Build output directory: `turnstile-inspection/pages-dist`;
- Pages environment variable `TURNSTILE_API_BASE`: публичный HTTPS URL Worker, например `https://turnstile-inspection-api.<account>.workers.dev`.

Скрипт публикует только PWA и шаблоны PDF. Исходники backend и конфигурация Worker в Pages output не копируются.

## Worker

Рабочая конфигурация создаётся из `cloudflare/wrangler.toml.example`.

Нужно подставить:

- D1 database id;
- KV namespace id;
- Pages origin в `ALLOWED_ORIGIN`;
- тот же Pages URL в `PUBLIC_APP_URL`;
- публичный VAPID key;
- VAPID subject.

Browser Run подключается через:

```toml
[browser]
binding = "BROWSER"
```

## Секреты

Одноразово выполнить:

```bash
cd turnstile-inspection/cloudflare
node scripts/generate-setup.mjs
```

Вывод содержит:

- `SESSION_PEPPER`;
- `PASSWORD_PEPPER`;
- `BOOTSTRAP_TOKEN`;
- `VAPID_PUBLIC_KEY`;
- `VAPID_PRIVATE_KEY`.

Приватные значения передаются в Cloudflare secrets и не сохраняются в репозитории.

## Инициализация

После создания D1 применяется `schema.sql`. Затем через защищённый bootstrap endpoint создаётся первая учётная запись администратора. После этого bootstrap повторно создать администратора уже не может.

Сотрудники создаются через интерфейс администратора приложения.

## Финальная проверка

Перед переключением production:

1. вход администратора;
2. создание тестового сотрудника;
3. осмотр одного гейта;
4. осмотр двух разных гейтов двумя пользователями;
5. offline-редактирование и последующая синхронизация;
6. переназначение незавершённого гейта;
7. автоматическое завершение;
8. Browser Run формирует PDF;
9. push «Акт сформирован» приходит администратору;
10. переоткрытие завершённого гейта создаёт новую версию PDF;
11. сотрудник видит свою историю, но не чужие гейты и не общий PDF.
