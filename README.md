# Seatiko

Единая ресторанная платформа для гостей, владельцев заведений и модерации: публичный сайт, кабинет владельца, Android-клиент, API на NestJS, карта, схема столиков и Twenty CRM.

**Пилот:** Бельцы, Молдова · **Языки:** RU / EN / RO

> Локальная разработка и демо. Перед production: [docs/ENGINEERING.md — Безопасность и production](docs/ENGINEERING.md#безопасность-и-production).

---

## Start here (для людей и AI)

Этот файл — **единственная общая точка входа**. Вся документация лежит в [`docs/`](docs/).

| Нужно | Открыть |
|--------|---------|
| **Индекс всей документации** | [`docs/README.md`](docs/README.md) |
| **Правила продукта** (бронь, QR, профиль, 18+, избранное, оплата, UX) | [`docs/APP_LOGIC.md`](docs/APP_LOGIC.md), [`docs/UX_SCREENS.md`](docs/UX_SCREENS.md) |
| **Статус редизайна страниц сайта** (готово / в работе) | [`docs/WEB_PAGES_STATUS.md`](docs/WEB_PAGES_STATUS.md) |
| **Инженерия** (Docker, API, CRM ops, тесты, production) | [`docs/ENGINEERING.md`](docs/ENGINEERING.md) |
| **Запуск кода + скриншоты** | [`seatiko/README.md`](seatiko/README.md) |
| **Прототип / диаграммы** | [`docs/prototype/`](docs/prototype/), [`docs/diagrams/`](docs/diagrams/) |

### Источники истины

| Тема | Канон |
|------|--------|
| Бизнес-логика, auth, профиль гостя, алкоголь | [`docs/APP_LOGIC.md`](docs/APP_LOGIC.md) |
| Экраны и переходы | [`docs/UX_SCREENS.md`](docs/UX_SCREENS.md) |
| Строки RU/EN/RO | [`docs/I18N.md`](docs/I18N.md) |
| Кабинет владельца | [`docs/RESTAURANT_OWNER_FLOW.md`](docs/RESTAURANT_OWNER_FLOW.md) |
| CRM sync | [`docs/TWENTY_CRM_INTEGRATION.md`](docs/TWENTY_CRM_INTEGRATION.md) |
| Карта (MapLibre) | [`docs/MAP_ARCHITECTURE.md`](docs/MAP_ARCHITECTURE.md) |
| Docker / API / ops | [`docs/ENGINEERING.md`](docs/ENGINEERING.md) |
| Скриншоты и demo checklist | [`seatiko/README.md`](seatiko/README.md) |

---

## Карта репозитория

```text
README.md                 ← вы здесь (hub)
docs/                     ← вся документация в одном месте
├── README.md             индекс docs
├── APP_LOGIC.md          ★ продукт
├── UX_SCREENS.md         ★ экраны
├── WEB_PAGES_STATUS.md   статус редизайна страниц сайта
├── I18N.md
├── RESTAURANT_OWNER_FLOW.md
├── TWENTY_CRM_INTEGRATION.md
├── MAP_ARCHITECTURE.md
├── CHANGELOG.md
├── ENGINEERING.md        ★ инженерия
├── prototype/
├── diagrams/
└── superpowers/          спеки/планы агентов
backend/                  API на NestJS + PostgreSQL (см. backend/README.md)
seatiko/            код
├── README.md             runbook + скриншоты
├── apps/web/
└── apps/mobile/
twenty/                   vendored CRM (не продукт FA)
docker-compose.yml
```

---

## Быстрый запуск

```bash
docker compose up -d --build --wait
docker compose ps
curl http://localhost/healthz
```

| URL | Назначение |
|-----|------------|
| http://localhost/ | сайт |
| http://localhost/cabinet | кабинет владельца |
| http://localhost/admin | модерация |
| http://localhost/discover | подбор предпочтений (web wizard → карта) |
| http://crm.localhost/ | Twenty CRM |
| http://localhost/api/docs | Swagger UI |
| http://localhost/api/openapi.yaml | OpenAPI |

Подробности запуска и интеграций смотрите в [ENGINEERING.md](docs/ENGINEERING.md), [MAP_ARCHITECTURE.md](docs/MAP_ARCHITECTURE.md) и [TWENTY_CRM_INTEGRATION.md](docs/TWENTY_CRM_INTEGRATION.md).

Android:

```bash
cd seatiko/apps/mobile
flutter run --dart-define=API_URL=http://10.0.2.2
```

---

## Гостевой профиль

- [`docs/APP_LOGIC.md` §8.3](docs/APP_LOGIC.md) — имя, фамилия, **как обращаться**, телефон, диета, оплата, избранное, история  
- [`docs/APP_LOGIC.md` §8.4](docs/APP_LOGIC.md) — 18+ / алкоголь: staff + ID → `alcohol_preorder_allowed`  
- [`docs/UX_SCREENS.md` §13](docs/UX_SCREENS.md) — wireframe профиля  

---

## Для AI / агентов

1. Читать этот `README.md` первым.  
2. Вся документация — только в `docs/` (+ `seatiko/README.md` для скриншотов).  
3. Менять продукт → `docs/APP_LOGIC.md` (+ UX / I18N).  
4. Менять инфраструктуру → `docs/ENGINEERING.md`.  
5. Не дублировать длинные разделы: править канон и ссылаться сюда.
