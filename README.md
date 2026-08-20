# Virtual Restaurant — FoodAssistant

Пилот: **Бельцы, Молдова**

## Один Docker на весь стек

```bash
# из корня проекта
docker compose up -d --build
```

| Сервис | URL |
|--------|-----|
| Twenty CRM | http://localhost:3000 |
| Next.js web | http://localhost:3001 |
| Go API | http://localhost:8080 |
| API health | http://localhost:8080/healthz |

Остановить:

```bash
docker compose down
```

Логи:

```bash
docker compose logs -f api web twenty-server
```

> Flutter (Android) не в Docker — запускается на эмуляторе/устройстве и ходит в API `:8080`.

## Структура

| Путь | Описание |
|------|----------|
| `docker-compose.yml` | Единый стек: CRM + API + Web |
| `.env` | Секреты и URL (приватный репо) |
| `foodassistant/` | Flutter, Next.js, Go |
| `virtual-restaurant/` | Документация и прототип |
| `twenty/` | Исходники Twenty CRM |

## Стек

- **Android:** Flutter  
- **Frontend:** Next.js (`:3001`)  
- **Backend:** Go (`:8080`)  
- **CRM:** Twenty (`:3000`)  

## Документация

См. `virtual-restaurant/docs/` и `foodassistant/README.md`.
