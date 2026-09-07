# FoodAssistant — Virtual Restaurant

Единая ресторанная платформа для гостей, владельцев заведений и модерации: публичный сайт, кабинет владельца, Android-клиент, Go API, карта, схема столиков и Twenty CRM.

**Пилот:** Бельцы, Молдова · **Языки:** RU / EN / RO

> Локальная разработка и демо. Перед production см. [docs/ENGINEERING.md — Безопасность и production](docs/ENGINEERING.md#безопасность-и-production).

---

## Start here (для людей и AI)

Этот файл — **единственная общая точка входа**. Не ищите «главный README» в подпапках: отсюда ветки ведут ко всем остальным документам.

| Нужно | Открыть |
|--------|---------|
| **Правила продукта** (бронь, QR, профиль гостя, алкоголь 18+, избранное, оплата, UX) | [`virtual-restaurant/docs/README.md`](virtual-restaurant/docs/README.md) → особенно [`APP_LOGIC.md`](virtual-restaurant/docs/APP_LOGIC.md), [`UX_SCREENS.md`](virtual-restaurant/docs/UX_SCREENS.md) |
| **Инженерия** (Docker, API, роли, CRM sync, тесты, production) | [`docs/ENGINEERING.md`](docs/ENGINEERING.md) |
| **Запуск кода + скриншоты** (кабинет владельца, карта, CRM webhook) | [`foodassistant/README.md`](foodassistant/README.md) |
| **Прототип / диаграммы** | [`virtual-restaurant/prototype/`](virtual-restaurant/prototype/), [`virtual-restaurant/diagrams/`](virtual-restaurant/diagrams/) |

### Источники истины (не дублировать вслепую)

| Тема | Канон |
|------|--------|
| Бизнес-логика, auth, профиль гостя, алкоголь | `virtual-restaurant/docs/APP_LOGIC.md` |
| Экраны и переходы | `virtual-restaurant/docs/UX_SCREENS.md` |
| Строки RU/EN/RO | `virtual-restaurant/docs/I18N.md` |
| Кабинет владельца | `virtual-restaurant/docs/RESTAURANT_OWNER_FLOW.md` |
| CRM sync | `virtual-restaurant/docs/TWENTY_CRM_INTEGRATION.md` |
| Карта (MapLibre) | `virtual-restaurant/docs/MAP_ARCHITECTURE.md` |
| Docker / API / ops | `docs/ENGINEERING.md` |
| Скриншоты и demo checklist | `foodassistant/README.md` |

---

## Карта документации

```text
README.md  ← вы здесь (hub)
├── virtual-restaurant/                 продукт + прототип
│   ├── README.md                       вход в продуктовую ветку
│   ├── docs/
│   │   ├── README.md                   индекс docs
│   │   ├── APP_LOGIC.md                ★ бизнес-логика
│   │   ├── UX_SCREENS.md               ★ экраны
│   │   ├── I18N.md
│   │   ├── RESTAURANT_OWNER_FLOW.md
│   │   ├── TWENTY_CRM_INTEGRATION.md
│   │   ├── MAP_ARCHITECTURE.md
│   │   └── CHANGELOG.md
│   ├── prototype/index.html
│   └── diagrams/foodassistant.drawio
├── docs/
│   └── ENGINEERING.md                  ★ инженерия (бывший длинный root README)
├── foodassistant/                      код
│   ├── README.md                       runbook + скриншоты
│   ├── apps/web/
│   ├── apps/mobile/
│   └── services/api/
└── twenty/                             vendored CRM (не править как продукт FA)
```

Спеки/планы агентов: [`docs/superpowers/`](docs/superpowers/).

---

## Быстрый запуск

Из **корня репозитория**:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost/healthz
```

| URL | Назначение |
|-----|------------|
| http://localhost/ | сайт |
| http://localhost/cabinet | кабинет владельца |
| http://localhost/admin | модерация |
| http://localhost/discover | подбор предпочтений (web) |
| http://crm.localhost/ | Twenty CRM |

Подробности, env, CRM bootstrap, API examples, backup: **[`docs/ENGINEERING.md`](docs/ENGINEERING.md)**.

Android:

```bash
cd foodassistant/apps/mobile
flutter run --dart-define=API_URL=http://10.0.2.2
```

---

## Репозиторий (кратко)

| Путь | Содержимое |
|------|------------|
| `foodassistant/apps/web` | Next.js — сайт, кабинет, админ |
| `foodassistant/apps/mobile` | Flutter Android — гостевой клиент |
| `foodassistant/services/api` | Go API |
| `virtual-restaurant/` | продуктовые docs, прототип, диаграммы |
| `twenty/` | Twenty CRM (docker) |
| `docker-compose.yml` | локальный стек |

---

## Гостевой профиль (напоминание)

Профиль гостя описан в продуктовых docs, не в engineering:

- [`APP_LOGIC.md` §8.3](virtual-restaurant/docs/APP_LOGIC.md) — имя, фамилия, **как обращаться**, телефон, аллергии/диета, способы оплаты, избранное, история  
- [`APP_LOGIC.md` §8.4](virtual-restaurant/docs/APP_LOGIC.md) — 18+ / алкоголь: **подтверждение staff + ID**, флаг `alcohol_preorder_allowed` (не самочекбокс в профиле)  
- [`UX_SCREENS.md` §13](virtual-restaurant/docs/UX_SCREENS.md) — wireframe профиля  

---

## Для AI / агентов

1. Читать этот `README.md` первым.  
2. Менять продукт → сверяться с `virtual-restaurant/docs/APP_LOGIC.md` (+ UX / I18N).  
3. Менять инфраструктуру / API / Docker → `docs/ENGINEERING.md`.  
4. Не считать `foodassistant/apps/*/README.md` источником продуктовых правил (там только указатели / шаблоны фреймворка).  
5. Не дублировать длинные разделы: править канон и ссылаться сюда.
