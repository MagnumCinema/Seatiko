# FoodAssistant — Virtual Restaurant

FoodAssistant — единая ресторанная платформа для гостей, владельцев заведений и команды модерации. В одном репозитории находятся публичный сайт, кабинет владельца, Android-приложение, backend API, интерактивная карта, схема столиков и Twenty CRM с двусторонней синхронизацией.

> Текущее окружение предназначено для локальной разработки и демонстрации. Перед публичным production-запуском обязательно выполните рекомендации из раздела [«Что изменить перед production»](#что-изменить-перед-production).

## Содержание

- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Структура репозитория](#структура-репозитория)
- [Роли и пользовательские сценарии](#роли-и-пользовательские-сценарии)
- [Модель данных](#модель-данных)
- [Быстрый запуск](#быстрый-запуск)
- [Адреса сервисов](#адреса-сервисов)
- [Настройка Twenty CRM](#настройка-twenty-crm)
- [API](#api)
- [Примеры полного сценария](#примеры-полного-сценария)
- [Постоянное хранение и резервные копии](#постоянное-хранение-и-резервные-копии)
- [Тестирование](#тестирование)
- [Диагностика](#диагностика)
- [Безопасность и production](#безопасность-и-production)

## Возможности

### Для гостя

- регистрация и вход;
- выбор города;
- карта опубликованных ресторанов;
- фильтрация и AI-поиск по естественному запросу;
- карточка заведения, меню и цены;
- интерактивная схема столиков;
- бронирование конкретного столика;
- подтверждение прихода;
- QR-сессия за столом;
- заказ блюд;
- вызов официанта;
- история заказов и бронирований;
- интерфейс RU / EN / RO.

### Для владельца ресторана

- отдельная регистрация с ролью `restaurant`;
- черновик анкеты без потери заполненных данных;
- адрес и точка на встроенной карте;
- контакты и необязательный сайт ресторана;
- до 8 фотографий JPG, PNG или WebP, каждая до 5 МБ;
- проверка готовности анкеты;
- отправка на модерацию;
- причина возврата на исправление;
- история всех изменений;
- список бронирований своего опубликованного заведения.

### Для администратора

- очередь заявок;
- начало проверки;
- одобрение или возврат с обязательной причиной;
- публикация ресторана;
- ручной запуск CRM reconcile;
- контроль состояния синхронизации.

### Для команды CRM

- владельцы и гости в `People`;
- рестораны в `Companies`;
- бронирования в `Reservations`;
- связи владелец → ресторан и бронь → ресторан/гость;
- Timeline изменений;
- двустороннее обновление разрешённых полей;
- защита ролей, паролей, модерации и публикации от изменения через CRM.

## Архитектура

### Общая схема

```mermaid
flowchart LR
    Guest[Гость: Web / Android]
    Owner[Владелец: Web-кабинет]
    Admin[Администратор: Web]

    Guest --> Nginx
    Owner --> Nginx
    Admin --> Nginx

    subgraph Docker[Docker Compose]
        Nginx[Nginx :80]
        Web[Next.js :3001]
        API[Go API :8080]
        State[(Atomic JSON state)]
        Uploads[(Uploads volume)]
        CRM[Twenty server]
        Worker[Twenty worker]
        DB[(PostgreSQL)]
        Redis[(Redis)]

        Nginx -->|страницы| Web
        Nginx -->|/api и /uploads| API
        Nginx -->|crm.localhost| CRM
        API --> State
        API --> Uploads
        API -->|REST upsert| CRM
        CRM -->|HMAC webhook| API
        CRM --> DB
        CRM --> Redis
        Worker --> DB
        Worker --> Redis
    end

    Android[Flutter Android] -->|HTTP API| Nginx
    Web -->|same-origin API| Nginx
```

### Маршрутизация

Nginx является единой точкой входа:

```text
http://localhost/          → Next.js
http://localhost/api/...   → Go API
http://localhost/uploads/  → загруженные фотографии
http://localhost/healthz   → health check API
http://crm.localhost/      → Twenty CRM
```

Backend напрямую не публикует порт `8080` на компьютере. Web использует same-origin URL `/api`, а Android Emulator обращается к Nginx через `http://10.0.2.2`.

### Карта

Карта не требует Google Cloud или банковской карты:

- MapLibre GL JS — сайт;
- MapLibre Native — Flutter;
- OpenFreeMap — векторные тайлы;
- OpenStreetMap — геоданные;
- FoodAssistant API — точки ресторанов и их состояние.

![Карта ресторанов](foodassistant/docs/images/08-site-map.jpg)

## Структура репозитория

```text
project1/
├── README.md                         # эта документация
├── docker-compose.yml                # весь локальный стек
├── .env                              # настройки Docker/Twenty
├── .env.keys                         # API key и webhook secret CRM
├── config/nginx/                     # единый reverse proxy
├── foodassistant/
│   ├── apps/web/                     # Next.js, TypeScript, MapLibre
│   ├── apps/mobile/                  # Flutter Android
│   ├── services/api/                 # Go, Gin, JWT, storage, CRM sync
│   ├── docs/images/                  # скриншоты README
│   └── README.md                     # пошаговая инструкция со скриншотами
├── virtual-restaurant/
│   ├── prototype/                    # UX-прототип
│   ├── diagrams/                     # проектные схемы
│   └── docs/                         # продуктовая и CRM-документация
└── twenty/                           # исходный код Twenty CRM
```

## Роли и пользовательские сценарии

| Роль | Значение API | Интерфейс | Основные права |
|---|---|---|---|
| Гость | `guest` | сайт и Android | карта, бронь, QR-сессия, заказ |
| Владелец | `restaurant` | `/cabinet` | анкета ресторана, фото, история, брони |
| Администратор | `admin` | `/admin` | модерация, публикация, CRM reconcile |

Администратора нельзя зарегистрировать публичным запросом. Локальный seed-аккаунт:

```text
email: admin@foodassistant.local
password: admin123
```

Это только development-аккаунт.

### Подключение ресторана

```mermaid
stateDiagram-v2
    [*] --> DRAFT: владелец создаёт анкету
    DRAFT --> SUBMITTED: готовность 7/7
    SUBMITTED --> UNDER_REVIEW: администратор начал проверку
    UNDER_REVIEW --> APPROVED: данные корректны
    UNDER_REVIEW --> REJECTED: нужны исправления
    REJECTED --> DRAFT: владелец изменил анкету
    APPROVED --> PUBLISHED: создан публичный Venue
    PUBLISHED --> [*]
```

Готовность 7/7 требует:

1. название и описание;
2. адрес;
3. допустимые ненулевые координаты;
4. минимум одну кухню;
5. телефон и корректный email;
6. часы работы;
7. минимум одну фотографию.

### Бронирование и посещение

```mermaid
sequenceDiagram
    actor Guest as Гость
    participant App as Web / Android
    participant API as FoodAssistant API
    participant CRM as Twenty CRM

    Guest->>App: выбирает ресторан и стол
    App->>API: POST /reservations
    API-->>App: CONFIRMED
    API->>CRM: upsert Reservation
    Guest->>App: подтверждает приход или сканирует QR
    App->>API: confirm-arrival / sessions/qr
    API-->>App: CHECKED_IN / ACTIVE session
    API->>CRM: обновление Booking Status
    Guest->>App: заказ и вызов официанта
    App->>API: order / waiter-call
```

![Интерактивный план столиков](foodassistant/docs/images/09-web-table-map.jpg)

## Модель данных

```mermaid
erDiagram
    USER ||--o{ VENUE_APPLICATION : owns
    USER ||--o{ RESERVATION : creates
    USER ||--o{ SESSION : starts
    VENUE_APPLICATION o|--o| VENUE : publishes_as
    VENUE ||--o{ TABLE : contains
    VENUE ||--o{ MENU_ITEM : offers
    VENUE ||--o{ RESERVATION : receives
    TABLE ||--o{ RESERVATION : assigned_to
    RESERVATION o|--o| SESSION : check_in
    SESSION ||--o{ ORDER : contains
    SESSION ||--o{ WAITER_CALL : creates
    ORDER ||--|{ ORDER_ITEM : contains
```

### Основные статусы

| Сущность | Статусы |
|---|---|
| Заявка | `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `PUBLISHED` |
| Стол | `FREE`, `RESERVED`, `OCCUPIED`, `CLEANING` |
| Бронь | `CONFIRMED`, `CHECKED_IN`, `CANCELLED`, `NO_SHOW` |
| Сессия | `ACTIVE`, `CLOSED` |
| Заказ | `DRAFT`, `SUBMITTED`, `PREPARING`, `READY`, `SERVED`, `PAID`, `CANCELLED` |
| Вызов | `PENDING`, `ACCEPTED`, `DONE` |

## Быстрый запуск

### Требования

- Docker Desktop с Docker Compose v2;
- свободный порт `80`;
- Flutter SDK и Android Studio — только для Android-разработки;
- Node.js 22 и Go 1.25 — только при запуске компонентов без Docker.

### 1. Конфигурация

В этом приватном репозитории рабочие `.env` и `.env.keys` включены по решению владельца. Для нового независимого окружения используйте шаблоны:

```bash
cp .env.example .env
cp .env.keys.example .env.keys
chmod 600 .env .env.keys
```

Минимальные секреты можно сгенерировать так:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Не меняйте действующий `ENCRYPTION_KEY` Twenty без резервной копии: он используется для расшифровки данных CRM.

### 2. Внешние volumes Twenty

Они объявлены как `external`, поэтому при первом запуске создайте их один раз:

```bash
docker volume create twenty_db-data
docker volume create twenty_server-local-data
```

### 3. Запуск всего проекта

```bash
cd /Users/iulian/Documents/work/project1
docker compose up -d --build
docker compose ps
```

Первый запуск Twenty может занять несколько минут. Дождитесь состояния `healthy`.

### 4. Проверка

```bash
curl -s http://localhost/healthz | jq
curl -s http://localhost/api/v1/cities | jq
```

Ожидаемый health response:

```json
{
  "status": "ok",
  "service": "foodassistant-api",
  "crm": {
    "enabled": true,
    "healthy": true,
    "running": false,
    "last_success_at": "2026-08-20T15:33:55Z"
  }
}
```

## Адреса сервисов

| URL | Назначение |
|---|---|
| http://localhost/ | главная и карта |
| http://localhost/business | страница для ресторанов |
| http://localhost/register | регистрация |
| http://localhost/login | вход |
| http://localhost/cabinet | кабинет владельца |
| http://localhost/admin | модерация |
| http://localhost/demo | гостевой web-сценарий |
| http://localhost/api/v1 | REST API |
| http://localhost/uploads | фотографии |
| http://crm.localhost/ | Twenty CRM |

`crm.localhost` обычно автоматически указывает на `127.0.0.1`. Если система его не разрешает, добавьте в `/etc/hosts`:

```text
127.0.0.1 crm.localhost
```

## Настройка Twenty CRM

### Сопоставление объектов

| FoodAssistant | Twenty | Ключ синхронизации |
|---|---|---|
| владелец или гость | `People` | `foodassistantUserId` |
| заявка/ресторан | `Companies` | `foodassistantId` |
| публичный ресторан | Company `venueId` | Venue ID |
| бронь | `Reservations` | `foodassistantReservationId` |

![Синхронизированные рестораны](foodassistant/docs/images/10-crm-restaurants-sync.png)

![Синхронизированные бронирования](foodassistant/docs/images/11-crm-reservations-sync.png)

### Направления синхронизации

FoodAssistant → Twenty:

- reconcile после важных изменений;
- фоновая сверка каждые 15 секунд;
- idempotent upsert по стабильным ID;
- автоматическое восстановление после временной ошибки.

Twenty → FoodAssistant:

- HMAC SHA-256 webhook;
- проверка timestamp;
- игнорирование API-origin echo;
- разрешены профиль, контакты, координаты, цены и рабочий статус брони;
- запрещены пароль, роль, владелец, модерация и публикация.

### Webhook

В `Settings → MCP & APIs → Webhooks`:

```text
URL: http://host.docker.internal/api/v1/integrations/twenty/webhook
Events: All Objects / All
Secret: значение TWENTY_WEBHOOK_SECRET
```

![Webhook Twenty](foodassistant/docs/images/12-crm-webhook.png)

Для локального Docker Twenty использует:

```env
TWENTY_OUTBOUND_HTTP_SAFE_MODE_ENABLED=false
```

В production safe mode должен быть включён, а webhook должен иметь публичный HTTPS URL.

### Подготовка схемы нового workspace

Текущий workspace уже настроен. Для нового workspace:

1. создать custom object `Reservations`;
2. добавить ресторанные поля Company и поля бронирования;
3. создать API key в `Settings → MCP & APIs → API`;
4. записать ключ и webhook secret в `.env.keys`;
5. запустить bootstrap стабильных ID:

```bash
cd foodassistant/services/api
set -a
source ../../../.env.keys
set +a
TWENTY_BASE_URL=http://crm.localhost go run ./cmd/crm-bootstrap
```

6. пересоздать API-контейнер:

```bash
cd ../../..
docker compose up -d --force-recreate api
```

Подробные правила: [virtual-restaurant/docs/TWENTY_CRM_INTEGRATION.md](virtual-restaurant/docs/TWENTY_CRM_INTEGRATION.md).

## API

### Общие правила

- Base URL: `http://localhost/api/v1`;
- формат: JSON, кроме multipart-загрузки фото;
- авторизация: `Authorization: Bearer <JWT>`;
- JWT действует 7 дней;
- время: ISO 8601 / RFC 3339, желательно UTC;
- локализованная строка: `{"ru":"...","en":"...","ro":"..."}`;
- ошибка: `{"error":"machine_readable_code"}`.

В примерах ниже используется:

```bash
API=http://localhost/api/v1
```

### Публичные маршруты

| Метод | Маршрут | Назначение |
|---|---|---|
| `GET` | `/healthz` вне `/api/v1` | здоровье API и CRM |
| `GET` | `/cities` | города |
| `GET` | `/venues?city_id=city-balti` | опубликованные рестораны |
| `GET` | `/venues/:id` | карточка ресторана |
| `GET` | `/venues/:id/tables` | схема столиков |
| `GET` | `/venues/:id/menu` | меню |
| `GET` | `/collections` | тематические подборки |
| `POST` | `/discover/ai` | поиск ресторанов по запросу |
| `POST` | `/auth/register` | регистрация гостя/владельца |
| `POST` | `/auth/login` | получение JWT |
| `GET` | `/integrations/twenty/status` | состояние CRM sync |
| `POST` | `/integrations/twenty/webhook` | подписанный webhook Twenty |

### Маршруты пользователя с JWT

| Метод | Маршрут | Назначение |
|---|---|---|
| `GET/PATCH` | `/me` | профиль пользователя |
| `POST/GET` | `/reservations` | создать / получить свои брони |
| `POST` | `/reservations/:id/confirm-arrival` | подтвердить приход |
| `POST` | `/tables/:id/watch` | наблюдать за столом 2 часа |
| `POST` | `/sessions/qr` | открыть QR-сессию |
| `GET/POST` | `/sessions/:id` / `/sessions/:id/close` | получить / закрыть сессию |
| `POST` | `/sessions/:id/orders` | создать заказ |
| `POST` | `/sessions/:id/waiter-calls` | вызвать официанта |
| `GET` | `/orders` | свои заказы |
| `GET` | `/staff/waiter-calls?venue_id=...` | вызовы по ресторану |
| `POST` | `/staff/waiter-calls/:id/accept` | принять вызов |

### Маршруты владельца

| Метод | Маршрут | Назначение |
|---|---|---|
| `POST/GET` | `/restaurant/applications` | создать / получить анкеты |
| `GET/PATCH` | `/restaurant/applications/:id` | получить / изменить анкету |
| `POST` | `/restaurant/applications/:id/photos` | загрузить фото |
| `DELETE` | `/restaurant/applications/:id/photos` | удалить фото |
| `POST` | `/restaurant/applications/:id/submit` | отправить на модерацию |
| `GET` | `/restaurant/applications/:id/activity` | история анкеты |
| `GET` | `/restaurant/reservations` | брони заведений владельца |

### Маршруты администратора

| Метод | Маршрут | Назначение |
|---|---|---|
| `GET` | `/admin/applications?status=SUBMITTED` | очередь заявок |
| `POST` | `/admin/applications/:id/review` | review/approve/reject |
| `POST` | `/admin/applications/:id/publish` | публикация |
| `POST` | `/admin/integrations/twenty/reconcile` | немедленная CRM-сверка |

## Примеры полного сценария

### 1. Публичный каталог

```bash
curl -s "$API/cities" | jq
curl -s "$API/venues?city_id=city-balti" | jq

VENUE_ID=$(curl -s "$API/venues?city_id=city-balti" | jq -r '.venues[0].id')
curl -s "$API/venues/$VENUE_ID" | jq
curl -s "$API/venues/$VENUE_ID/tables" | jq
curl -s "$API/venues/$VENUE_ID/menu" | jq
```

AI-поиск:

```bash
curl -s -X POST "$API/discover/ai" \
  -H 'Content-Type: application/json' \
  -d '{"query":"молдавская кухня, свободный столик и средний чек до 400 лей"}' | jq
```

### 2. Регистрация владельца и создание ресторана

```bash
OWNER_RESPONSE=$(curl -s -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"owner@example.test",
    "password":"strong-password",
    "first_name":"Ion",
    "last_name":"Popescu",
    "locale":"ro",
    "role":"restaurant"
  }')

OWNER_TOKEN=$(jq -r '.token' <<<"$OWNER_RESPONSE")
```

Создание пустой анкеты:

```bash
APPLICATION_RESPONSE=$(curl -s -X POST "$API/restaurant/applications" \
  -H "Authorization: Bearer $OWNER_TOKEN")

APPLICATION_ID=$(jq -r '.application.id' <<<"$APPLICATION_RESPONSE")
```

Заполнение:

```bash
curl -s -X PATCH "$API/restaurant/applications/$APPLICATION_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":{"ru":"Casa Bunicii","en":"Grandmas House","ro":"Casa Bunicii"},
    "description":{"ru":"Домашняя молдавская кухня","en":"Moldovan home cooking","ro":"Bucătărie moldovenească"},
    "address":{"ru":"Бельцы, ул. Индепенденцей 10","en":"10 Independentei St, Balti","ro":"str. Independenței 10, Bălți"},
    "cuisine":["moldovan","european"],
    "phone":"+37360000000",
    "email":"restaurant@example.test",
    "website":"https://restaurant.example.test",
    "city_id":"city-balti",
    "lat":47.7617,
    "lng":27.9288,
    "price_level":2,
    "average_check":350,
    "hours_text":"Пн–Вс 10:00–23:00"
  }' | jq
```

Фото и отправка:

```bash
curl -s -X POST "$API/restaurant/applications/$APPLICATION_ID/photos" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -F 'photo=@/absolute/path/to/restaurant.jpg' | jq

curl -s -X POST "$API/restaurant/applications/$APPLICATION_ID/submit" \
  -H "Authorization: Bearer $OWNER_TOKEN" | jq
```

### 3. Модерация и публикация

```bash
ADMIN_RESPONSE=$(curl -s -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@foodassistant.local","password":"admin123"}')

ADMIN_TOKEN=$(jq -r '.token' <<<"$ADMIN_RESPONSE")

curl -s -X POST "$API/admin/applications/$APPLICATION_ID/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"UNDER_REVIEW"}' | jq

curl -s -X POST "$API/admin/applications/$APPLICATION_ID/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"APPROVED"}' | jq

curl -s -X POST "$API/admin/applications/$APPLICATION_ID/publish" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

Возврат вместо одобрения:

```bash
curl -s -X POST "$API/admin/applications/$APPLICATION_ID/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"REJECTED","reject_reason":"Уточните часы работы и добавьте фото фасада"}' | jq
```

### 4. Бронирование столика

```bash
GUEST_RESPONSE=$(curl -s -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"guest@example.test",
    "password":"strong-password",
    "first_name":"Ana",
    "last_name":"Rusu",
    "locale":"ru",
    "role":"guest"
  }')

GUEST_TOKEN=$(jq -r '.token' <<<"$GUEST_RESPONSE")
VENUE_ID=$(curl -s "$API/venues?city_id=city-balti" | jq -r '.venues[0].id')
TABLE_ID=$(curl -s "$API/venues/$VENUE_ID/tables" | jq -r '.tables[] | select(.status=="FREE") | .id' | head -1)

RESERVATION_RESPONSE=$(curl -s -X POST "$API/reservations" \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"venue_id\":\"$VENUE_ID\",
    \"table_id\":\"$TABLE_ID\",
    \"guests\":2,
    \"reserved_for\":\"2027-01-20T18:30:00Z\",
    \"source\":\"WEB\"
  }")

RESERVATION_ID=$(jq -r '.reservation.id' <<<"$RESERVATION_RESPONSE")

curl -s -X POST "$API/reservations/$RESERVATION_ID/confirm-arrival" \
  -H "Authorization: Bearer $GUEST_TOKEN" | jq
```

Android отправляет тот же запрос с `"source":"ANDROID"`.

### 5. QR-сессия, заказ и официант

В MVP принимается любой непустой QR token, например `demo`:

```bash
SESSION_RESPONSE=$(curl -s -X POST "$API/sessions/qr" \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"venue_id\":\"$VENUE_ID\",\"table_id\":\"$TABLE_ID\",\"token\":\"demo\"}")

SESSION_ID=$(jq -r '.session.id' <<<"$SESSION_RESPONSE")
MENU_ITEM_ID=$(curl -s "$API/venues/$VENUE_ID/menu" | jq -r '.menu[0].id')

curl -s -X POST "$API/sessions/$SESSION_ID/orders" \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"menu_item_id\":\"$MENU_ITEM_ID\",\"qty\":2}]}" | jq

curl -s -X POST "$API/sessions/$SESSION_ID/waiter-calls" \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"bill"}' | jq

curl -s -X POST "$API/sessions/$SESSION_ID/close" \
  -H "Authorization: Bearer $GUEST_TOKEN" | jq
```

Допустимые причины вызова: `order`, `bill`, `question`, `other`, `initial`.

### 6. CRM status и ручная сверка

```bash
curl -s "$API/integrations/twenty/status" | jq

curl -s -X POST "$API/admin/integrations/twenty/reconcile" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

## Постоянное хранение и резервные копии

### FoodAssistant

API использует atomic JSON snapshot:

```text
/app/data/foodassistant-state.json
```

Он содержит пользователей с bcrypt-хешами, заявки, рестораны, столы, брони, сессии, заказы и историю. Запись выполняется через временный файл и atomic rename. Файл внутри volume имеет права `600`.

Volumes:

| Volume | Данные |
|---|---|
| `virtual-restaurant_api-data` | состояние API |
| `virtual-restaurant_api-uploads` | фотографии |
| `twenty_db-data` | PostgreSQL Twenty |
| `twenty_server-local-data` | локальные файлы Twenty |

Просмотр:

```bash
docker volume ls | rg 'virtual-restaurant|twenty'
```

Перед ручным переносом или восстановлением остановите изменяющие данные сервисы и сделайте резервную копию всех четырёх volumes. Для production используйте регулярный `pg_dump`, объектное хранилище и проверяемую процедуру восстановления.

## Тестирование

### Backend

```bash
cd foodassistant/services/api
go test ./...
```

### Web

```bash
cd foodassistant/apps/web
npm ci
npm run lint
npm run build -- --webpack
```

### Android

```bash
cd foodassistant/apps/mobile
flutter pub get
flutter analyze
flutter test
```

Запуск Android Emulator:

```bash
flutter run --dart-define=API_URL=http://10.0.2.2
```

### Docker и документация

```bash
cd /Users/iulian/Documents/work/project1
docker compose config --quiet
git diff --check
curl -fsS http://localhost/healthz | jq
```

## Диагностика

### Состояние контейнеров

```bash
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
docker compose logs --tail=100 twenty-server twenty-worker
```

### CRM отключена

Симптом:

```json
{"enabled":false,"healthy":false}
```

Проверить:

1. существует `.env.keys`;
2. API key активен в Twenty;
3. `docker compose up -d --force-recreate api` выполнен после изменения ключа;
4. `http://crm.localhost/healthz` доступен;
5. в API logs нет `crm_sync_failed`.

### Webhook получает 401

- secret Twenty должен совпадать с `TWENTY_WEBHOOK_SECRET`;
- timestamp и подпись должны передаваться в заголовках Twenty;
- после ротации secret пересоздайте API-контейнер;
- проверьте `docker compose logs api | rg twenty/webhook`.

### Webhook не доходит локально

- URL должен быть `http://host.docker.internal/api/v1/integrations/twenty/webhook`;
- у `twenty-worker` должен быть `OUTBOUND_HTTP_SAFE_MODE_ENABLED=false`;
- worker должен быть запущен;
- в production не отключайте safe mode — используйте публичный HTTPS URL.

### Карта пустая

- проверить доступ к OpenFreeMap и OpenStreetMap;
- проверить `GET /api/v1/venues?city_id=city-balti`;
- убедиться, что ресторан имеет статус `PUBLISHED`;
- проверить координаты и отсутствие нулевых `lat/lng`.

### Фото не загружается

- допустимы JPG, PNG, WebP;
- размер одного файла — до 5 МБ;
- максимум — 8 фото;
- заявка должна быть `DRAFT` или `REJECTED`;
- проверить volume `api-uploads`.

### `crm.localhost` не открывается

```bash
curl -I http://crm.localhost/
```

Если имя не разрешается, добавьте `127.0.0.1 crm.localhost` в `/etc/hosts`.

## Безопасность и production

### Секреты в приватном репозитории

По явному решению владельца проекта рабочие `.env` и `.env.keys` включаются в этот приватный репозиторий. Это удобно для единственного владельца, но всё равно означает, что GitHub и вся история Git содержат секреты.

Если репозиторий когда-либо станет публичным или появится новый участник:

1. немедленно отозвать Twenty API keys;
2. сменить JWT и `APP_SECRET`;
3. сменить пароль PostgreSQL;
4. не менять `ENCRYPTION_KEY` без официальной процедуры миграции и backup;
5. очистить Git history специализированным инструментом;
6. перейти на GitHub Actions Secrets, Vault, SOPS или secrets manager.

Никогда не выводите содержимое `.env.keys` в CI logs.

### Что изменить перед production

- заменить `admin123` и отключить публичные development credentials;
- установить длинный случайный `JWT_SECRET`;
- ограничить CORS вместо `*`;
- включить HTTPS;
- включить Twenty outbound safe mode;
- использовать публичный HTTPS webhook;
- создать минимальную CRM-роль вместо Admin API key;
- добавить rate limiting и защиту login/register;
- добавить подтверждение email и восстановление пароля;
- заменить demo QR token на подписанные одноразовые токены;
- перенести FoodAssistant state из JSON в PostgreSQL перед несколькими API replicas;
- перенести uploads в S3-совместимое хранилище;
- настроить мониторинг, audit retention и резервные копии;
- закрепить точную версию Twenty вместо `latest`;
- добавить CI для Go, Next.js, Flutter и Docker Compose.

## Дополнительная документация

- [Пошаговая инструкция FoodAssistant со скриншотами](foodassistant/README.md)
- [Правила двусторонней CRM-интеграции](virtual-restaurant/docs/TWENTY_CRM_INTEGRATION.md)
- [Продуктовая документация и прототип](virtual-restaurant/docs/README.md)
- [Android README](foodassistant/apps/mobile/README.md)
- [Web README](foodassistant/apps/web/README.md)
