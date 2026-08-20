# FoodAssistant

Пилот: **Бельцы, Молдова**

| Слой | Стек | Путь |
|------|------|------|
| Android | Flutter | `apps/mobile` |
| Web | Next.js | `apps/web` |
| Backend | Go | `services/api` |
| Docs / прототип | — | `../virtual-restaurant` |
| CRM | Twenty | `../twenty` → http://localhost:3000 |

## Быстрый старт

### 1. Go API

```bash
cd services/api
cp .env.example .env
go run ./cmd/api
```

API: http://localhost:8080  
Health: http://localhost:8080/healthz

### 2. Next.js web

```bash
cd apps/web
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local
npm run dev
```

Web: http://localhost:3001 (или порт Next по умолчанию 3000 — не пересекайте с Twenty)

### 3. Flutter (Android)

```bash
cd apps/mobile
# эмулятор Android → API на хосте:
flutter run --dart-define=API_URL=http://10.0.2.2:8080
# реальное устройство в той же Wi‑Fi — IP Mac:
# flutter run --dart-define=API_URL=http://192.168.x.x:8080
```

Языки UI: **ru / en / ro** (переключатель в шапке).

## MVP порядок (APP_LOGIC §14)

1. ✅ Auth + каталог заведений + карта города (seed Бельцы)
2. Зал: схема столиков + state machine + realtime
3. Бронирование
4. QR + сессия
5. Меню + заказ
6. Staff
7. Предзаказ / оплата / AI

## API сейчас

- `GET /api/v1/cities`
- `GET /api/v1/venues?city_id=city-balti`
- `GET /api/v1/venues/:id`
- `GET /api/v1/venues/:id/tables`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/me` (Bearer JWT)
