# Seatiko backend (NestJS)

API Seatiko: NestJS 12 + PostgreSQL (Drizzle). Перенесён с Go целиком: те же маршруты, ответы и коды ошибок,
сайт и Android работают без изменений. Архитектура, правила слоёв и история переноса — [PLAN.md](./PLAN.md).

## Запустить проект

Все настройки и ключи — в одном файле `.env` в корне репозитория (не в git). Первый раз:

```bash
git pull
cp .env.example .env      # впишите SEATIKO_ADMIN_EMAIL / SEATIKO_ADMIN_PASSWORD (и ключи, если есть)
docker compose up -d --build
```

Сайт — http://localhost, CRM — http://crm.localhost. При первом запуске API сам:

- применяет миграции базы и справочник городов;
- создаёт администратора из `SEATIKO_ADMIN_EMAIL` / `SEATIKO_ADMIN_PASSWORD`;
- загружает настоящие кафе и рестораны Бельц из OpenStreetMap и Overture (~1 мин, потом раз в неделю;
  другие города — `OPEN_PLACES_CITIES=balti,chisinau`);
- синхронизирует Twenty CRM, если задан `TWENTY_API_KEY` (через пару секунд после каждого изменения).

Демо-данных на сайте нет: только настоящие места и аккаунты, которые регистрируются.

## Модули

| Модуль | Что делает |
|---|---|
| `catalog`, `map`, `open-places` | города, заведения, меню, доступность; карта с местами OSM + Overture |
| `accounts`, `notifications` | вход, профиль, аватар, удаление аккаунта (GDPR); уведомления и SSE |
| `reservations`, `waitlist` | брони, «Я приду», предзаказ и кухня по времени, банкеты, очередь |
| `floor`, `adult`, `orders` | QR-сессии, заказы, оплата, вызов официанта, панель персонала, 18+ |
| `applications`, `venue-admin`, `staff-team` | заявки ресторанов и модерация, кабинет владельца, персонал и смены |
| `admin`, `discover`, `crm` | отчёты админки, AI-подбор (Groq + правила), Twenty CRM |

## Команды

```bash
npm install
npm run build          # сборка
npm test               # unit-тесты (Vitest)
npm run lint           # oxlint
npm run places:import  # обновить места OSM + Overture сейчас
```

Контрактные тесты (чёрный ящик по HTTP, весь OpenAPI-контракт `contract/openapi.yaml`) гоняются против
отдельной тестовой базы с демо-данными, никогда против основной:

```bash
DATABASE_URL=postgres://seatiko:seatiko-dev-password@127.0.0.1:5433/seatiko_test npm run db:seed
DATABASE_URL=…/seatiko_test JWT_SECRET=test-secret-1234567 ADDR=127.0.0.1:18091 OPEN_PLACES_IMPORT=false node dist/main.js &
CONTRACT_BASE_URL=http://127.0.0.1:18091 npm run test:contract
```

## Запуск API без Docker

```bash
docker compose up -d seatiko-db minio             # PostgreSQL на localhost:5433
npm run build && node --env-file=../.env dist/main.js
```
