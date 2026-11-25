# Карта Seatiko

На сайте можно выбрать город или всю Молдову и искать заведения по названию и адресу. Поиск в каталоге Seatiko охватывает варианты написания на русском, румынском и английском. Фильтр «Можно забронировать» показывает заведения с настроенными столами. В режиме Google Maps кнопка «Поиск в этой области» обновляет результаты по видимой части карты. Google возвращает до 20 результатов за запрос.

Встроенная Google Maps показывает точки Seatiko и результаты Google Places. Запись из Google связывается с партнёром по `google_place_id`. При сбое Google Places партнёры остаются на карте. При сбое загрузки Google Maps сайт переключается на OpenFreeMap, где видны точки Seatiko. Поисковый запрос и выбранный город передаются в ссылку на Google Maps. Android использует OpenFreeMap и каталог Seatiko.

## Включение Google в Docker

В проекте Google Cloud с активным биллингом включите **Maps JavaScript API** и **Places API (New)**. Запишите ключи в `.env` и включите карту Google: `GOOGLE_MAPS_ENABLED=true`. Без этого сайт показывает бесплатную карту OpenFreeMap.

| Переменная | Применение |
|---|---|
| `GOOGLE_MAPS_BROWSER_KEY` | Публичный браузерный ключ. Ограничьте его API Maps JavaScript и HTTP referrers сайта, включая `http://localhost/*` для Docker. |
| `GOOGLE_PLACES_API_KEY` | Серверный ключ для Places API (New). При наличии статического исходящего IP ограничьте его этим адресом. |
| `GOOGLE_MAPS_MAP_ID` | Идентификатор стиля карты. При пустом значении используется демо-идентификатор Google для локальной разработки. |

```dotenv
GOOGLE_MAPS_ENABLED=true
GOOGLE_MAPS_BROWSER_KEY=...
GOOGLE_PLACES_API_KEY=...
GOOGLE_MAPS_MAP_ID=
```

После изменения: `docker compose up -d nest-api`. Браузер получает ключ из `/api/v1/map/config` при открытии страницы.

Проверьте поиск по Кишинёву и по Молдове в Swagger. Успешный ответ от Google даёт `source.google_status: ready`. Значение `unavailable` указывает, что Google не выполнил запрос. Проверьте разрешения ключа, включённые API, биллинг и ограничения исходящего подключения. Google Places выдаёт результаты по запросу. Карта не сохраняет эти результаты в базе.

[Настройка ключа Google Maps](https://developers.google.com/maps/documentation/javascript/get-api-key) · [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)

## API карты

- `GET /api/v1/map/config` возвращает границы страны, список городов и публичные настройки Google Maps.
- `GET /api/v1/map/places?city_id=city-chisinau&lang=ro` ищет в пределах Кишинёва.
- `GET /api/v1/map/places?city_id=all` ищет по Молдове.
- `q` ищет по названию и адресу в пределах выбранного города, страны или видимой области.
- `bookable_only=true` возвращает опубликованные заведения с настроенными столами и пропускает запрос в Google Places. Свободные столы на конкретное время проверяются отдельно.
- Параметр `bounds=south,west,north,east` сужает запрос до видимой области. Backend пересекает её с границами выбранного города или страны и исключает Google-результаты с кодом страны, отличным от `MD`.
- `include_google=false` возвращает только партнёров Seatiko.

[Swagger UI](http://localhost/api/docs)
