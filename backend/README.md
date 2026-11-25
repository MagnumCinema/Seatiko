# Seatiko backend (NestJS)

Перенос API Seatiko с Go (`seatiko/services/api`) на NestJS. План, архитектура и этапы — [PLAN.md](./PLAN.md).

Статус: этап 0 — контрактные тесты (чёрный ящик по HTTP, 105/105 операций `openapi.yaml`).

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
