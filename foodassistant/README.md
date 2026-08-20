# FoodAssistant

Пилот: **Бельцы, Молдова** — реализация по `virtual-restaurant/docs` и UX-прототипу.

## Стек

| Слой | Технология | URL / запуск |
|------|------------|--------------|
| Backend | Go | http://localhost:8080 |
| Web | Next.js | http://localhost:3001 |
| Android | Flutter | `flutter run` |
| CRM | Twenty | http://localhost:3000 |

## Docker (всё сразу)

```bash
# из корня project1
docker compose up -d --build
```

| Сервис | URL |
|--------|-----|
| CRM | http://localhost:3000 |
| Web | http://localhost:3001 |
| API | http://localhost:8080/healthz |

## Клиентский путь (как в прототипе)

Онбординг → город → карта → заведение → карта зала → бронь  
QR → выбор заказа → сессия → меню/официант → оплата  
Вкладки: Карта · Подбор · Заказы · Профиль (+ ряд QR)

## API (MVP §1–6)

- Auth, города, заведения, столы (FREE/RESERVED/OCCUPIED)
- Бронь, «Я приду», TableWatch
- QR-сессия, меню, заказ, вызов официанта
- Discover AI + праздничные подборки
- Staff: список/accept вызовов

## Flutter

```bash
cd apps/mobile
flutter run --dart-define=API_URL=http://10.0.2.2:8080   # emulator
# QR demo: venue-1:t1
```

## Языки

RU / EN / RO — переключатель в UI.
