# Twenty CRM: интеграция с FoodAssistant

## Назначение

Twenty — внутренний рабочий кабинет команды FoodAssistant. Владелец ресторана регистрируется и управляет заведением только через FoodAssistant. CRM получает актуальную проекцию владельцев, ресторанов, гостей и бронирований, но не управляет авторизацией или публикацией.

## Фактическая модель данных

| Twenty | Что хранит | Ключ upsert |
|---|---|---|
| `People` | владельцы и гости: имя, email, телефон, роль и язык | `foodassistantUserId` |
| `Companies` | одна заявка/ресторан: профиль, адрес, контакты, фото и lifecycle status | `foodassistantId` |
| `Reservations` | дата, гости, стол, источник и рабочий статус брони | `foodassistantReservationId` |

Дополнительные идентификаторы `venueId`, `foodassistantVenueId`, `foodassistantTableId` и `foodassistantUserId` позволяют проверить связи и восстановить синхронизацию без сопоставления по имени.

Стандартные демо Opportunities, Dashboard и Workflows были удалены по подтверждению владельца проекта. Сами стандартные объекты Twenty оставлены, но не участвуют в текущей ресторанной интеграции.

## Двусторонняя синхронизация

### FoodAssistant → Twenty

1. Изменение сначала сохраняется в FoodAssistant persistent state.
2. API запускает reconcile после важной операции.
3. Фоновая сверка повторяется каждые 15 секунд.
4. REST upsert ищет запись по стабильному ID.
5. Relations связывают владельца с рестораном, а бронь — с гостем и Company.
6. Повторная доставка безопасна и не создаёт дубли.

### Twenty → FoodAssistant

1. Twenty отправляет `company.updated`, `person.updated` или `reservation.updated`.
2. API проверяет HMAC SHA-256, timestamp и допустимое окно времени.
3. Webhook, созданный нашим API-ключом, игнорируется как echo.
4. Ручное изменение разрешённого поля применяется к FoodAssistant.
5. В кабинете появляется `CRM_PROFILE_UPDATED`.
6. Reconcile возвращает нормализованное значение в CRM.

## Правила конфликтов

| Данные | Источник истины | Почему |
|---|---|---|
| Пароль, роль, user ID | FoodAssistant | CRM не должна управлять доступом |
| Owner application | FoodAssistant | нельзя незаметно передать ресторан другому владельцу |
| `DRAFT…PUBLISHED` | FoodAssistant | ручное поле CRM не должно публиковать ресторан |
| Профиль и контакты | последнее разрешённое ручное изменение | менеджер CRM и владелец могут исправлять данные |
| Статус брони | FoodAssistant или разрешённое ручное CRM-изменение | поддерживает звонок/приход/no-show |
| Timeline | обе системы | техническая и пользовательская история сохраняются отдельно |

Поля CRM проверяются теми же правилами, что форма: корректный email, HTTP/HTTPS сайт, допустимые координаты, price level 1–3 и неотрицательный средний чек.

## Границы интеграции

- В CRM попадают только пользователи и заведения, относящиеся к реальной заявке.
- Seed-точки карты без заявки владельца не создают Company.
- Бронь синхронизируется, если её venue связан с опубликованной заявкой.
- Заказы и высокочастотное состояние столиков остаются в операционном API; CRM получает бизнес-бронь, а не каждый UI-клик.

## Надёжность

```text
request → persistent state → HTTP response
              │
              ├── immediate reconcile trigger
              └── periodic reconcile / retry
                         │
                         ▼
                    Twenty REST

Twenty manual edit → signed webhook → validation → persistent state
```

- Сбой CRM не блокирует регистрацию, анкету или бронирование.
- Atomic JSON snapshot переживает рестарт контейнера.
- Uploads хранятся в отдельном volume.
- `/healthz` и `/api/v1/integrations/twenty/status` показывают состояние интеграции.
- Ошибка сохраняется в CRM status и очищается после успешной сверки.

## Локальная конфигурация

Backend получает:

```env
TWENTY_BASE_URL=http://twenty-server:3000
TWENTY_API_KEY=...
TWENTY_WEBHOOK_SECRET=...
TWENTY_SYNC_INTERVAL_SECONDS=15
DATA_FILE=/app/data/foodassistant-state.json
```

Webhook Twenty:

```text
http://host.docker.internal/api/v1/integrations/twenty/webhook
```

Self-hosted локальная CRM работает с `OUTBOUND_HTTP_SAFE_MODE_ENABLED=false`, потому что Twenty иначе блокирует private Docker IP. Это исключение только для разработки. Production должен использовать публичный HTTPS webhook и включённый safe mode.

## Проверка

1. Изменить кухню тестового ресторана в Twenty.
2. Убедиться через FoodAssistant API, что новое значение применилось.
3. Вернуть исходное значение.
4. Проверить HTTP 200 webhook в логах API.
5. Запустить reconcile и убедиться, что число People, Companies и Reservations не изменилось.
6. Перезапустить API и проверить повторный вход и сохранность заявок.

Подробная инструкция и скриншоты: [`../foodassistant/README.md`](../foodassistant/README.md).
