# Seatiko backend (NestJS)

Перенос API Seatiko с Go (`seatiko/services/api`) на NestJS. План, архитектура и этапы — [PLAN.md](./PLAN.md).

Статус: этап 0 (контрактные тесты) готов, этап 1 (каркас) почти готов — см. PLAN.md.

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
