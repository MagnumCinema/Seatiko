# Virtual Restaurant — FoodAssistant

**Один репозиторий** · **один Docker Compose** · **один вход: порт 80**

Пилот: **Бельцы, Молдова**

## Запуск

```bash
docker compose up -d --build
```

| Что | URL |
|-----|-----|
| Приложение (Next.js) | http://localhost/ |
| API | http://localhost/api/v1/... |
| Health | http://localhost/healthz |
| Twenty CRM | http://crm.localhost/ |

`crm.localhost` обычно открывается без правки hosts (резолвится в 127.0.0.1).

Остановить: `docker compose down`

## Структура (один корень)

```
project1/                      ← единственный .git
├── docker-compose.yml
├── .env
├── config/nginx/              ← nginx :80
├── foodassistant/
│   ├── apps/mobile/           ← Flutter **только Android**
│   ├── apps/web/              ← Next.js
│   └── services/api/          ← Go API
├── virtual-restaurant/        ← доки + прототип
└── twenty/                    ← исходники CRM (без своего .git)
```

## Android

```bash
cd foodassistant/apps/mobile
flutter run --dart-define=API_URL=http://10.0.2.2
# устройство в Wi‑Fi:
# flutter run --dart-define=API_URL=http://<IP-Mac>
```

## Документация

`virtual-restaurant/docs/` · `foodassistant/README.md`
