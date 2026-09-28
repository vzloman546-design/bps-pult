# Развёртывание командной версии

Командная PWA развёртывается статически и доступна через два frontend:

- GitHub Pages: `https://vzloman546-design.github.io/bps-pult/turnstile-team/`;
- Cloudflare Pages: резервный адрес на время миграции.

Backend, база и realtime пока остаются в Cloudflare. Такой переход позволяет отдельно проверить доступность frontend из российских сетей без риска для существующих учётных записей и данных.

## Что создаётся в Cloudflare

- один Workers Free Worker для API;
- одна D1 база `turnstile-inspection`;
- один Workers KV namespace `DOCUMENTS` для готовых PDF;
- один Durable Object class `InspectionRoom`;
- один Browser Run binding `BROWSER` для автоматической генерации PDF;
- один Cloudflare Pages project как резервный frontend и источник статических ресурсов для Browser Run во время миграции.

Платный Workers plan не требуется.

## Frontend — GitHub Pages

GitHub Pages в репозитории уже публикуется из ветки `main`. Командная PWA не заменяет существующее приложение в корне Pages: готовый bundle помещается в каталог `turnstile-team/`.

Автоматическая цепочка:

1. изменения в `feature/turnstile-team-workflow` проходят `Turnstile Team Check`;
2. workflow `.github/workflows/turnstile-github-pages-publish.yml`, который хранится в `main`, запускается через `workflow_run` только после успешной push-проверки feature-ветки;
3. workflow checkout-ит точный проверенный SHA feature-ветки;
4. запускается `turnstile-inspection/pages-build.sh`;
5. содержимое `pages-dist` записывается в `main/turnstile-team/`;
6. штатный GitHub Pages build ветки `main` публикует обновление.

Production URL командной PWA:

```text
https://vzloman546-design.github.io/bps-pult/turnstile-team/
```

Все PWA-пути относительные, поэтому manifest, service worker, иконки и переходы работают внутри каталога `/bps-pult/turnstile-team/`.

## Frontend — Cloudflare Pages

Cloudflare Pages остаётся включённым во время миграции:

- Production branch: `feature/turnstile-team-workflow` до финального merge, затем `main`;
- Build command: `bash turnstile-inspection/pages-build.sh`;
- Build output directory: `turnstile-inspection/pages-dist`;
- Pages environment variable `TURNSTILE_API_BASE`: публичный HTTPS URL Worker, например `https://turnstile-inspection-api.<account>.workers.dev`.

Скрипт публикует только PWA и шаблоны PDF. Исходники backend и конфигурация Worker в Pages output не копируются.

## Worker

Production-конфигурация автоматически разрешает CORS одновременно для:

- Cloudflare Pages origin;
- `https://vzloman546-design.github.io`.

Важно: CORS использует origin без пути `/bps-pult/turnstile-team/`.

`PUBLIC_APP_URL` пока остаётся адресом Cloudflare Pages, потому что Browser Run использует его для загрузки статических ресурсов при серверной генерации PDF. Это не мешает пользователям открывать саму PWA через GitHub Pages.

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
- VAPID key pair.

Приватные значения передаются в Cloudflare secrets и не сохраняются в репозитории.

## Инициализация

После создания D1 применяется `schema.sql`. Затем через защищённый bootstrap endpoint создаётся первая учётная запись администратора. После этого bootstrap повторно создать администратора уже не может.

Сотрудники создаются через интерфейс администратора приложения.

## Проверка GitHub Pages

1. Откройте `https://vzloman546-design.github.io/bps-pult/turnstile-team/`.
2. В РФ повторите проверку с выключенным VPN.
3. Убедитесь, что экран входа загружается.
4. Выполните вход администратора.
5. Проверьте список сотрудников и активный осмотр.
6. На устройстве сотрудника войдите и откройте назначенный гейт.
7. Измените один турникет и убедитесь, что изменение видно администратору.
8. Включите уведомления заново на GitHub Pages origin: Web Push подписка привязана к origin и service worker.
9. Проверьте запуск установленной PWA после закрытия браузера.

Если шаг 1 работает без VPN, а шаг 4 не работает, значит frontend перенесён успешно, но российская сеть не пропускает `workers.dev`. В этом случае следующим отдельным этапом переносится backend/API.

## Финальная проверка

Перед окончательным отключением Cloudflare Pages:

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
