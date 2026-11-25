# Seatiko backend (NestJS)

Перенос API Seatiko с Go (`seatiko/services/api`) на NestJS. План, архитектура и этапы — [PLAN.md](./PLAN.md).

Статус: этапы 0–5 готовы (каркас, схема БД, каталог и карта, аккаунт, брони). Дальше: зал (QR, заказы), кабинеты ресторана и админа, AI-подбор, Twenty CRM — см. PLAN.md.

## Посмотреть сайт

Все настройки и ключи — в одном файле `.env` в корне (не в git). Первый раз:

```bash
git pull
cp .env.example .env      # впишите SEATIKO_ADMIN_EMAIL / SEATIKO_ADMIN_PASSWORD (и ключи, если есть)
docker compose up -d --build
```

Сайт — http://localhost. Поднимается и Nest (`COMPOSE_PROFILES=nest` в `.env`); при первом запуске он сам
загружает настоящие кафе и рестораны Бельц из OpenStreetMap и Overture (~1 мин), администратор создаётся из `.env`.
Демо-данных на сайте нет: только настоящие места и аккаунты, которые регистрируются.

Какой бэкенд отвечает сайту — `SEATIKO_API_UPSTREAM` в `.env`: `api:8080` (Go) или `nest-api:8080` (Nest),
после изменения `docker compose up -d nginx`. На Nest уже работают: карта и каталог, вход и регистрация, профиль,
брони, предзаказ, очередь. Пока только на Go: кабинет ресторана, персонал, админка, AI-подбор, CRM.

## Команды

```bash
npm install
npm run build          # сборка
npm test               # unit-тесты (Vitest)
npm run lint           # oxlint

# Контрактные тесты против запущенного API (Go сейчас, Nest потом):
CONTRACT_BASE_URL=http://127.0.0.1:18090 npm run test:contract
```

Контрактный набор ожидает свежий сервер с демо-данными (`JWT_SECRET` любой, Twenty и Google выключены) и в конце печатает, какие операции контракта не покрыты.

## Запуск Nest локально

```bash
docker compose up -d seatiko-db                  # PostgreSQL на localhost:5433
npm run build && node --env-file=../.env dist/main.js   # настройки — из корневого .env
```

Структура и правила слоёв — в PLAN.md, раздел «Архитектура и структура».

## Какой бэкенд обслуживает сайт

nginx отдаёт `/api/` бэкенду из `SEATIKO_API_UPSTREAM`:

```bash
docker compose up -d nginx                                                # Go (по умолчанию)
SEATIKO_API_UPSTREAM=nest-api:8080 docker compose --profile nest up -d nginx   # NestJS
```

Пока Nest реализует не все маршруты, переключать стоит только для проверки.
