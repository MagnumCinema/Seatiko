# FoodAssistant

Часть монорепо Virtual Restaurant. Вход через nginx: **http://localhost/**

| Слой | Путь |
|------|------|
| Web | `apps/web` |
| Android | `apps/mobile` (только Android) |
| API | `services/api` |

## Запуск стека

Из корня репозитория:

```bash
docker compose up -d --build
```

- App: http://localhost/  
- API: http://localhost/api/v1/  
- CRM: http://crm.localhost/  

## Flutter (Android)

```bash
cd apps/mobile
flutter run --dart-define=API_URL=http://10.0.2.2
```
