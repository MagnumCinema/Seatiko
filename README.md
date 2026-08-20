# Virtual Restaurant — FoodAssistant

**Один репозиторий** · **один Docker** · **вход: порт 80**

## Как устроено

| Канал | Для кого | Где |
|-------|----------|-----|
| **Сайт** http://localhost/ | Презентация, регистрация ресторанов, кабинет, админка | Next.js |
| **Android** | Гостевое приложение (как прототип) | Flutter |
| **Прототип** | UX wireframe | `virtual-restaurant/prototype` |
| **CRM** http://crm.localhost/ | Владельцы, рестораны, гости, брони и Timeline | Twenty |

## Поток ресторана

1. Сайт → «Для ресторанов» → регистрация  
2. Кабинет → анкета + фото  
3. Отправка на модерацию  
4. Админ одобряет и публикует  
5. Заведение появляется в API / на карте приложения  

Данные проекта сохраняются в Docker volumes. FoodAssistant и Twenty связаны двусторонней синхронизацией: backend выполняет idempotent upsert по стабильным ID, а ручные безопасные изменения CRM возвращаются в проект через подписанный webhook.

## Запуск

```bash
docker compose up -d --build
```

## Бесплатная интерактивная карта

Карта работает без Google Cloud, API-ключа и банковской карты:

- сайт: **MapLibre GL JS**;
- Android: **MapLibre Native** через Flutter;
- векторные тайлы: **OpenFreeMap**;
- геоданные: **OpenStreetMap**;
- точки ресторанов: собственный FoodAssistant API.

Карта встроена прямо в главную страницу сайта и в раздел «Карта» Android-приложения. Атрибуция источников показывается автоматически. Для запуска достаточно обычной команды `docker compose up -d --build`.

Публичный OpenFreeMap не требует регистрации и не ограничивает число просмотров, но не предоставляет SLA. При большом коммерческом трафике тот же стек можно развернуть на своём сервере без переделки интерфейса.

| URL | Что |
|-----|-----|
| http://localhost/ | Презентация |
| http://localhost/business | Для ресторанов |
| http://localhost/cabinet | Кабинет ресторана |
| http://localhost/admin | Админка модерации |
| http://localhost/demo | Гостевой UX-демо (web) |
| http://localhost/api/... | API |
| http://crm.localhost/ | Twenty CRM |

**Админ:** `admin@foodassistant.local` / `admin123`

Подробная пошаговая инструкция со скриншотами: [`foodassistant/README.md`](./foodassistant/README.md).

Логика CRM, границы ответственности и правила конфликтов: [`virtual-restaurant/docs/TWENTY_CRM_INTEGRATION.md`](./virtual-restaurant/docs/TWENTY_CRM_INTEGRATION.md).

## Android

```bash
cd foodassistant/apps/mobile
flutter run --dart-define=API_URL=http://10.0.2.2
```
