# Seatiko backend (NestJS)

Перенос API Seatiko с Go (`seatiko/services/api`) на NestJS. План, архитектура и этапы — [PLAN.md](./PLAN.md).

Статус: этапы 0–5 готовы (каркас, схема БД, каталог и карта, аккаунт, брони). Дальше: зал (QR, заказы), кабинеты ресторана и админа, AI-подбор, Twenty CRM — см. PLAN.md.

## Посмотреть сайт

```bash
git pull
docker compose up -d --build          # сайт на http://localhost, API — Go (как раньше)
```

Новый бэкенд (Nest) с настоящими заведениями Бельц из OpenStreetMap и Overture:

```bash
docker compose --profile nest up -d --build seatiko-db nest-api
# первый запуск сам импортирует кафе и рестораны Бельц (~1 мин), проверить:
docker compose logs nest-api | grep "open places"
SEATIKO_API_UPSTREAM=nest-api:8080 docker compose --profile nest up -d nginx   # сайт → Nest
docker compose up -d nginx                                                    # вернуть Go
```

На Nest уже работают: карта и каталог, вход и регистрация, профиль, брони, предзаказ, очередь.
Ещё нет (пока смотреть на Go): QR и заказы за столом, кабинет ресторана, персонал, админка, AI-подбор, CRM.
Демо-аккаунты для проверки на Nest (только для разработки): `docker compose exec nest-api node dist/database/seed/seed.js`,
затем `docker compose exec nest-api node dist/cli/import-open-places.js`, чтобы заново привязать заведения к карте.

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
docker compose --profile nest up -d seatiko-db   # PostgreSQL на localhost:5433
cp .env.example .env
npm run build && node --env-file=.env dist/main.js
```

Структура и правила слоёв — в PLAN.md, раздел «Архитектура и структура».

## Какой бэкенд обслуживает сайт

nginx отдаёт `/api/` бэкенду из `SEATIKO_API_UPSTREAM`:

```bash
docker compose up -d nginx                                                # Go (по умолчанию)
SEATIKO_API_UPSTREAM=nest-api:8080 docker compose --profile nest up -d nginx   # NestJS
```

Пока Nest реализует не все маршруты, переключать стоит только для проверки.
