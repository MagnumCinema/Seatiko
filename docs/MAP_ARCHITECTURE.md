# Карта Seatiko

На сайте можно открыть отдельный город или Молдову целиком. В режиме Google Maps кнопка «Поиск в этой области» обновляет результаты по видимой части карты. Google возвращает до 20 результатов за запрос. В режиме всей страны результаты ранжируются в пределах текущей области.

Встроенная Google Maps показывает точки Seatiko и результаты Google Places. Запись из Google связывается с партнёром по `google_place_id`. Забронировать стол можно у опубликованного партнёра. При сбое Google Places партнёры остаются на карте. При сбое загрузки Google Maps сайт переключается на OpenFreeMap, где видны точки Seatiko. В каждом режиме есть ссылка на поиск в приложении или на сайте Google Maps. Android использует OpenFreeMap и каталог Seatiko.

## Включение Google в Docker

В проекте Google Cloud с активным биллингом включите **Maps JavaScript API** и **Places API (New)**. Запишите два отдельных ключа в локальный файл `.seatiko-local/google.env`. Этот файл Go API читает автоматически. Для новой установки папку создаёт Docker Compose.

| Переменная | Применение |
|---|---|
| `GOOGLE_MAPS_BROWSER_KEY` | Публичный браузерный ключ. Ограничьте его API Maps JavaScript и HTTP referrers сайта, включая `http://localhost/*` для Docker. |
| `GOOGLE_PLACES_API_KEY` | Серверный ключ для Places API (New). При наличии статического исходящего IP ограничьте его этим адресом. |
| `GOOGLE_MAPS_MAP_ID` | Идентификатор стиля карты. При пустом значении используется демо-идентификатор Google для локальной разработки. |

После сохранения файла серверный ключ применяется при следующем запросе. Браузер получает актуальный ключ из `/api/v1/map/config` при открытии или обновлении страницы. API читает папку через Docker, поэтому замена ключей обходится без перезапуска контейнеров.

Формат файла:

```dotenv
GOOGLE_MAPS_BROWSER_KEY=...
GOOGLE_PLACES_API_KEY=...
GOOGLE_MAPS_MAP_ID=
```

Если строка отсутствует, API использует значение из окружения, включая `.env.integration.local`, загруженный при запуске. Пустое значение явно отключает унаследованный ключ. Настройки Twenty остаются в `.env.integration.local`. Ключ Places передаётся только Go API.

Проверьте поиск по Кишинёву и по Молдове в Swagger. Успешный ответ от Google даёт `source.google_status: ready`. Значение `unavailable` указывает, что Google не выполнил запрос. Проверьте разрешения ключа, включённые API, биллинг и ограничения исходящего подключения. Google Places выдаёт результаты по запросу. Карта не сохраняет эти результаты в базе.

[Настройка ключа Google Maps](https://developers.google.com/maps/documentation/javascript/get-api-key) · [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)

## API карты

- `GET /api/v1/map/config` возвращает границы страны, список городов и публичные настройки Google Maps.
- `GET /api/v1/map/places?city_id=city-chisinau&lang=ro` ищет в пределах Кишинёва.
- `GET /api/v1/map/places?city_id=all` ищет по Молдове.
- Параметр `bounds=south,west,north,east` сужает запрос до видимой области. Backend пересекает её с границами выбранного города или страны и исключает Google-результаты с кодом страны, отличным от `MD`.
- `include_google=false` возвращает только партнёров Seatiko.

[Swagger UI](http://localhost/api/docs)
