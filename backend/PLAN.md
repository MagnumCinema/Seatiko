# План: бэкенд Seatiko на NestJS

Цель: переписать весь API Seatiko (сейчас Go, `seatiko/services/api`) на NestJS в папке `backend/`, без изменений для сайта, Android-приложения и Twenty CRM. `twenty/` не трогаем.

Статус (ветка `feat/nest-backend`):
- **этап 0 готов** — контрактные тесты: 50 тестов, 116/116 операций, зелёные на Go (включая смены из PR #18);
- **этап 1 почти готов** — каркас: конфиг на Zod, ядро (ошибки `{"error": code}`, валидация, время как в Go, JWT совместимый с Go, guard ролей), Drizzle, `/healthz`, `/api/openapi.yaml`, `/api/docs`, Dockerfile, `seatiko-db` и `nest-api` в compose (профиль `nest`). Осталось: проверить `/healthz` с живой базой (нужен запущенный Docker).

Анализ — по `main` @ `2516de34`.

---

## 1. Что есть сейчас

### Объём

| Часть | Go, строк | Тестов | Что делает |
|---|---:|---:|---|
| `internal/store` | 8 330 | 12 файлов | вся бизнес-логика + хранение в памяти со снапшотом в JSON |
| `internal/crm` | 2 510 | 6 | синхронизация с Twenty, вебхук, схема, воронка, дашборд, задачи |
| `internal/handlers` | 2 170 | — | 116 HTTP-маршрутов (gin) |
| `internal/discover` | 840 | 3 | фильтры `/discover`, счётчик, AI (Groq + правила) |
| `internal/places` | 750 | 4 | Google Places: поиск на карте, фото, отзывы |
| `internal/models` | 620 | — | 39 типов (JSON-контракт) |
| `cmd/api` | 600 | 1 | роутер, middleware, планировщик кухни |
| `internal/media` | 440 | 2 | аватары: S3 (SigV4) / локальная папка, обработка картинок |
| `internal/auth`, `config`, `qr`, `apidocs` | 310 | 1 | JWT, rate limit, конфиг, подпись QR, OpenAPI |
| `cmd/*` (утилиты) | 370 | — | `crm-bootstrap`, `migrate-live-state`, `repair-state-passwords` |
| **Итого** | **≈17 000** | **100 тестов** | |

Контракт: `internal/apidocs/openapi.yaml` — ≈5 100 строк, 116 операций (после PR #18: смены персонала, удаление анкеты и сотрудника), тест сверяет его с роутером.

### Маршруты (116) по группам

| Группа | Кол-во | Примеры |
|---|---:|---|
| Публичные | 17 | `/cities`, `/venues`, `/venues/:id/{tables,schedule,menu,places}`, `/availability`, `/map/{config,places}`, `/places/photo`, `/discover/ai`, `/collections`, `/auth/{register,login}`, `/healthz`, вебхук Twenty |
| Гость (JWT) | 38 | `/me` (+avatar, email, password, notifications, stream), `/reservations` (+preorder, confirm-arrival, cancel, history), `/sessions` (QR, orders, waiter-calls), `/orders`, `/payments`, `/waitlist`, `/event-inquiries`, `/tables/:id/watch` |
| Персонал | 14 | `/staff/{waiter-calls,orders,reservations,waitlist}`, 18+ grant/revoke, age-check |
| Ресторан | 21 | `/restaurant/applications` (CRUD, фото, submit, change-requests), меню, столы, QR, правила брони, аналитика, персонал |
| Админ | 13 | `/admin/{overview,people,companies,reservations,orders,applications,change-requests,crm,adult-permission-log}` |

### Данные (20 коллекций в одном JSON-файле)

`work_shifts, cities, venues, tables, users, reservations, watches, sessions, menu_items, orders, waiter_calls, collections, applications, activities, staff_members, profile_changes, waitlist, adult_permission_log, notifications, demo_menu_version`.

Всё в памяти под одним мьютексом, при каждой записи — атомарная перезапись `seatiko-state.json`.

### Фоновые процессы

- синхронизация с Twenty CRM (тикер, по умолчанию 15 с) + ручной `reconcile`;
- планировщик кухни (30 с): предзаказ в `kitchen_at` → `PREPARING` + уведомления;
- поток уведомлений (SSE) с пингом каждые 25 с;
- при старте: backfill демо-данных (фото, часы, меню, координаты, пароли демо-пользователей).

### Внешние зависимости

Twenty (REST + GraphQL + метаданные, вебхук с подписью), Google Places (ключи в `.seatiko-local/google.env`, перечитываются на лету), Groq, S3/MinIO, JWT (общий `JWT_SECRET`).

### Кто зависит от контракта

- веб (`seatiko/apps/web/src/lib/api.ts`, ~93 вызова);
- Android (`seatiko/apps/mobile/lib/api.dart`, 27 вызовов);
- Twenty (шлёт вебхуки на `/api/v1/integrations/twenty/webhook`);
- nginx (`config/nginx/nginx.conf`: `/api/`, SSE-поток, `/uploads/`).

### Найденные проблемы, которые закроем при переносе

1. **Нет базы данных**: весь стейт в памяти и одном JSON — не масштабируется, нет транзакций, один процесс.
2. **`eventInquiries` (заявки на банкеты) не сохраняются в снапшот** — пропадают при перезапуске.
3. Rate limit и подписки SSE живут в памяти процесса — не работают при двух репликах.
4. Пересечения броней проверяются циклом по всем броням под глобальной блокировкой.
5. `memory.go` — 2 460 строк, логика всех доменов в одном файле.
6. Смены персонала (`/restaurant/venues/:id/shifts`): дата и время не проверяются на формат (принимается `"someday"`), начало может быть позже конца. В Nest — строгие `YYYY-MM-DD`, `HH:MM`, начало < конца.

---

## 2. Целевая архитектура

### Стек

| Что | Выбор | Почему |
|---|---|---|
| Рантайм | Node.js 24 LTS | как у сайта (Node 22) — обновим и его позже |
| Фреймворк | NestJS 12 (ESM), адаптер Express | модули, DI, guards, pipes, SSE из коробки |
| База | **PostgreSQL 16, отдельный контейнер `seatiko-db`** | транзакции, ограничения; базу Twenty не используем |
| ORM | **Drizzle через `@nestjs/drizzle`** | официальный модуль Nest 12 (у Prisma официального модуля нет, её `latest` сейчас — release candidate 8.0); схема в TypeScript, миграции `drizzle-kit` |
| Кэш / очереди | Redis (отдельный `seatiko-redis`) + BullMQ | планировщик кухни, CRM-синк, rate limit, SSE между репликами |
| Валидация | Zod + `StandardSchemaValidationPipe` (Nest 12) | схемы без декораторов, тип запроса выводится из схемы |
| Документация | существующий `openapi.yaml` = источник правды | + `@nestjs/swagger` только для сверки |
| Тесты | Vitest (стандарт Nest 12) + контрактный набор на `fetch` | один и тот же набор гоняем против Go и Nest |
| Пароли / JWT | `bcrypt`, `@nestjs/jwt` с тем же `JWT_SECRET` и claims | старые токены и пароли работают без сброса |

### Архитектура и структура `backend/`

Модульный монолит: один процесс, внутри — независимые доменные модули с чёткими слоями. Так проще деплоить сейчас и можно вынести модуль в сервис позже.

```text
backend/
  PLAN.md  AGENTS.md  package.json  nest-cli.json  drizzle.config.ts  Dockerfile
  src/
    main.ts                    ← запуск: адаптер, глобальные pipes/filters, порт
    app.module.ts              ← собирает модули, ничего не делает сам
    config/                    ← схема env на Zod, типизированный доступ к настройкам
    core/                      ← сквозное, без бизнес-логики
      http/                    ← фильтр ошибок {"error": "code"}, сериализация времени как в Go
      auth/                    ← JWT (совместим с Go), guards: auth, роли, активный аккаунт; @CurrentUser, @Roles, @Public
      errors/                  ← доменные ошибки (NotFound, Forbidden, Conflict…) → HTTP-коды
      time/                    ← часовой пояс Europe/Chisinau, «сейчас» (подменяется в тестах)
    database/                  ← Drizzle: подключение, транзакции
      schema/                  ← таблицы по доменам (users.ts, venues.ts, reservations.ts…)
      migrations/              ← генерирует drizzle-kit
      seed/                    ← демо-данные пилота
    integrations/              ← адаптеры внешних систем за интерфейсами
      storage/  google-places/  groq/  twenty/
    modules/                   ← бизнес-домены
      auth/  account/  catalog/  map/  availability/  reservations/  preorders/  adult/
      floor/  waitlist/  events/  notifications/  restaurant/  staff/  admin/  discover/  crm/
  test/
    contract/                  ← чёрный ящик по HTTP, общий для Go и Nest (готово)
    e2e/                       ← сценарии через приложение Nest (@nestjs/testing)
```

Внутри каждого модуля одинаково:

```text
modules/reservations/
  reservations.module.ts       ← что импортирует и что отдаёт наружу
  reservations.controller.ts   ← только HTTP: маршрут, схема запроса, вызов сервиса, форма ответа
  reservations.service.ts      ← бизнес-правила (пересечения, «Я приду», отмена)
  reservations.repository.ts   ← только запросы Drizzle, без правил
  reservations.schemas.ts      ← Zod-схемы запросов + выведенные типы
  reservations.events.ts       ← события домена (ReservationCancelled…)
  reservations.service.spec.ts ← unit-тесты правил (перенос Go-тестов)
```

Правила, которые держим:

1. **Слои идут сверху вниз**: controller → service → repository. Контроллер не ходит в базу, сервис не знает про `Request`/`Response`, репозиторий не принимает решений.
2. **Модули не лезут в чужие репозитории.** Нужны данные соседа — через его экспортированный сервис. Реакции на события (уведомления, CRM-синк, кухня) — через `@nestjs/event-emitter`, без прямых вызовов.
3. **Внешние системы — только через `integrations/`** и интерфейс; в тестах подставляем фейк.
4. **Ошибки домена — классы из `core/errors`**, один фильтр превращает их в `{"error": "code"}` с нужным HTTP-кодом, как в Go.
5. **Время и id** берём из `core/time` и одного генератора — тесты управляют «сейчас».
6. **Конфиг читается только через `config/`**, `process.env` в коде модулей не используется.
7. Один модуль = одна папка; файл больше ~400 строк — сигнал разделить.

### Как сохраняем совместимость

Сайт и Android не меняются: nginx отдаёт `/api/` тому бэкенду, что указан в `SEATIKO_API_UPSTREAM` (`api:8080` — Go, `nest-api:8080` — Nest). Переключение и откат — одна переменная, без пересборки фронта.

При включённой CRM Go-шный `/healthz` добавляет `{"crm": {"enabled", "healthy"}}` — Nest повторит это на этапе 9.

- Те же пути (`/api/v1/...`), методы, коды ответов и коды ошибок (`{"error": "preorder_closed"}`).
- Тот же JSON: имена полей, `omitempty` (поля без значения не выводим), время в RFC 3339 UTC, `LocalizedString` как `{ru,en,ro}`.
- Те же переменные окружения (`JWT_SECRET`, `S3_*`, `GROQ_*`, `TWENTY_*`, `GOOGLE_*`, `DATA_FILE` больше не нужен → `DATABASE_URL`).
- Те же id записей (uuid и `venue-1`…), чтобы ссылки, QR и CRM-связи не сломались.

### Ключевые решения по данным

- `LocalizedString` → колонка `jsonb`.
- Пересечение броней — ограничение Postgres `EXCLUDE USING gist (table_id WITH =, tstzrange(blocks_from, blocks_until) WITH &&)` на таблице «бронь ↔ стол»: двойная бронь невозможна даже при гонке запросов.
- Брони на несколько столов — отдельная таблица `reservation_tables`.
- Заказы и позиции — `orders` + `order_items` (цена на момент заказа, `age_check`).
- Журналы (18+, активность анкет) — append-only таблицы.
- Уведомления — таблица + Redis pub/sub для живой доставки на любую реплику.

### Готовые библиотеки вместо своего кода

В Go многое написано вручную. В Nest берём проверенные пакеты, свой код — только бизнес-логика. Версии фиксируем при старте (этап 1), каждую проверяем на актуальность и поддержку.

| Задача | Сейчас в Go | В Nest берём |
|---|---|---|
| Конфиг и проверка env | свой `config.go` | `@nestjs/config` + схема `zod` (падаем при старте, если переменной нет) |
| JWT, роли | свой middleware | `@nestjs/jwt` + `@nestjs/passport` / `passport-jwt`, guard ролей на декораторе `@Roles()` |
| Валидация запросов | ручные проверки в хендлерах | Zod-схемы + `StandardSchemaValidationPipe` |
| Rate limit | свой счётчик в памяти | `@nestjs/throttler` + хранилище в Redis (`@nest-lab/throttler-storage-redis`) — работает на нескольких репликах |
| Планировщик кухни, CRM-синк | тикеры-горутины | `@nestjs/schedule` + `@nestjs/locks` (задача идёт на одной реплике); тяжёлое — `@nestjs/bullmq` |
| События домена (бронь, предзаказ → уведомления, CRM) | прямые вызовы | `@nestjs/event-emitter`: сервисы публикуют событие, уведомления и CRM подписаны |
| SSE | свой хаб с каналами | встроенный `@Sse()` в Nest + RxJS, рассылка между репликами через Redis pub/sub (`ioredis`) |
| S3 / MinIO | своя подпись SigV4 | `@nestjs/storage` (диски local / S3 / R2, публичные URL) |
| Загрузка файлов | свой разбор multipart | `FileInterceptor` (multer) + `ParseFilePipe` с `MaxFileSizeValidator`; тип — по magic bytes через `file-type` |
| Обработка картинок | `x/image` + своя обрезка | `sharp` (обрезка, ресайз, удаление EXIF, WebP) |
| Groq (AI) | свой HTTP-клиент | официальный `groq-sdk` (или `openai` SDK с `baseURL` Groq) |
| Google Places | свой HTTP-клиент | официальный `@googlemaps/places` |
| Twenty CRM | свой REST/GraphQL-клиент + проверка подписи вебхука | `@nestjs/webhooks` (приём и подпись), `@nestjs/resilience` (повторы, таймауты), HTTP — встроенный `fetch` |
| Часовой пояс Europe/Chisinau | встроенная tzdata Go | `date-fns-tz` (или Luxon) |
| Пароли | `bcrypt` (Go) | `bcrypt` (Node) — хэши совместимы |
| Здоровье сервиса | свой `/healthz` | `@nestjs/terminus` (проверка БД, Redis, S3) |
| Логи | `log.Printf` | `nestjs-pino` (JSON-логи, request id) |
| Безопасность HTTP | — | `helmet`, встроенный CORS |
| OpenAPI | ручной yaml | `@nestjs/swagger` для сверки; контракт по-прежнему `openapi.yaml`, ответы проверяем валидатором OpenAPI в e2e (например `jest-openapi`) |
| БД | JSON-файл | `@nestjs/drizzle` + `drizzle-orm` (`node-postgres`), миграции `drizzle-kit` |
| Тесты | `go test` | `@nestjs/testing` + Vitest, `supertest` для HTTP |
| QR-подпись | HMAC в `internal/qr` | встроенный `node:crypto` (тот же алгоритм, старые QR остаются валидными) |

Что остаётся своим кодом: правила брони и пересечений, расчёт свободных слотов, предзаказ и 18+, фильтры `/discover`, логика синхронизации с CRM, сид демо-данных.

Эффект: минус ≈ 5–6 дней к оценке (S3, rate limit, планировщик, SSE-хаб, загрузка и обработка файлов, клиенты Groq и Google уже готовы).

---

## 3. Этапы

Принцип: **сначала фиксируем поведение Go тестами, потом переносим**. Каждый этап — отдельный PR, Go продолжает работать в проде до переключения.

| # | Этап | Что входит | Готово, когда | Оценка |
|---|---|---|---|---|
| 0 | Контрактный набор | e2e-тесты на `fetch` по всем 105 маршрутам (happy path + главные ошибки), гоняются против Go через `BASE_URL`; сверка с `openapi.yaml` | набор зелёный на Go | 4–5 дн |
| 1 | Каркас | Nest-проект, конфиг, Drizzle, `seatiko-db` + `seatiko-redis` в compose (профиль `nest`), формат ошибок, JWT-совместимость, роли, rate limit, `/healthz`, `/api/docs`, Dockerfile, CI | `/healthz` и `/api/openapi.yaml` проходят контрактные тесты | 3 дн |
| 2 | Схема и сид | схема Drizzle для всех 19 коллекций + `event_inquiries`, миграции, ограничение на пересечения, сид демо-данных (как `seed()` в Go) | `drizzle-kit migrate` + сид поднимают те же данные, что Go | 3–4 дн |
| 3 | Каталог и карта | cities, venues, tables, schedule, menu, collections, map/config, map/places + Google Places, places/photo, availability | контракт по этим маршрутам зелёный на Nest | 4 дн |
| 4 | Аккаунт | register/login, /me, email, пароль, удаление (GDPR), аватар (S3/MinIO, `sharp`) | вход старыми паролями и токенами работает | 3 дн |
| 5 | Бронирование | reservations, confirm-arrival, cancel, history, watch, waitlist, event-inquiries | двойная бронь невозможна; тесты конфликтов из Go перенесены | 5 дн |
| 6 | Зал и заказы | QR-сессии (подпись QR как в `internal/qr`), заказы, вызовы официанта, оплата, предзаказ, 18+, планировщик кухни (BullMQ) | сценарии предзаказа и 18+ из Go-тестов зелёные | 5 дн |
| 7 | Кабинеты | restaurant (анкеты, фото, модерация, меню, столы, QR, правила, аналитика, персонал), staff, admin | весь контракт зелёный | 6 дн |
| 8 | Уведомления и AI | лента + SSE через Redis, discover (фильтры, счётчик, Groq + правила) | SSE работает через nginx и при 2 репликах | 3 дн |
| 9 | Twenty CRM | клиент REST/GraphQL, проверка схемы/воронки/дашборда, синк (очередь BullMQ), вебхук с подписью, задачи онбординга | синк и вебхук на тестовом Twenty дают тот же результат, что Go | 6–7 дн |
| 10 | Перенос данных | `import-go-state.ts`: JSON → Postgres с сохранением id, проверка счётчиков и выборочная сверка ответов Go vs Nest на копии прод-данных | два прогона на копии без расхождений | 2–3 дн |
| 11 | Переключение | окно записи: остановить Go → импорт → `SEATIKO_API_UPSTREAM=nest-api:8080 docker compose --profile nest up -d nginx` → смоук-тесты; откат — та же команда без переменной (Go) | сайт, Android и Twenty работают на Nest | 1 дн + наблюдение |
| 12 | Уборка | удалить `seatiko/services/api`, обновить README, ENGINEERING, docker-compose | Go в репозитории нет | 1 дн |

**Итого: ≈ 40–46 рабочих дней одного разработчика** (≈ 2 месяца) с учётом готовых библиотек (оценки этапов выше даны без них). Этапы 3–8 частично параллелятся, с двумя людьми — ≈ 5–6 недель.

### Почему не постепенно, по одному маршруту

Go хранит всё в одном JSON в памяти. Если часть маршрутов перевести на Nest + Postgres, у данных будет два источника правды. Поэтому Nest строим целиком рядом, проверяем тем же контрактным набором и переключаем разом, с переносом данных.

---

## 4. Риски и что с ними делаем

| Риск | Мера |
|---|---|
| Мелкие расхождения JSON (пустые поля, формат времени, `null` vs отсутствие) ломают Android | контрактный набор сравнивает ответы Go и Nest побайтно по ключам; общий сериализатор |
| Старые токены / пароли не подходят | тот же `JWT_SECRET`, те же claims, `bcrypt` совместим с Go |
| SSE обрывается за nginx / при нескольких репликах | отдельный location уже есть; Redis pub/sub; тест через nginx |
| Двойные брони под нагрузкой | `EXCLUDE`-ограничение в Postgres + транзакции |
| CRM получит дубли | идемпотентный upsert по внешним id, первый прогон на тестовом Twenty |
| Потеря данных при переключении | короткое окно только для чтения, импорт, сверка счётчиков; откат = вернуть nginx на Go и импорт обратно (скрипт `export-to-go-state.ts`) |
| Регресс бизнес-логики | все 100 Go-тестов переносим в Vitest как unit-тесты сервисов |

---

## 5. Что не меняется

- `twenty/` — не трогаем, Twenty работает как сейчас.
- Сайт и Android — без изменений кода (тот же контракт).
- nginx — меняется только upstream `fa_api` при переключении.
- Go-бэкенд работает до этапа 11 и удаляется на этапе 12.

---

## 6. Нужно решить до старта

1. ~~ORM~~ — решено: Drizzle через `@nestjs/drizzle` (официальный модуль Nest 12).
2. **База**: отдельный контейнер `seatiko-db` (рекомендую) или отдельная база на сервере Postgres от Twenty?
3. **Redis**: свой `seatiko-redis` (рекомендую) или отдельная база (индекс) в Redis Twenty?
4. **Новые фичи на время переноса**: замораживаем API на Go (рекомендую, только багфиксы) или делаем фичи сразу в двух местах?
5. **Откат**: держать Go 2 недели после переключения — ок?
