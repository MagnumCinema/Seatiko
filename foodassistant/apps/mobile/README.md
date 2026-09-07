# FoodAssistant Mobile (Flutter)

Гостевой Android-клиент: карта, заведения, бронь, QR-сессия.

> **Репозиторий:** [`../../../README.md`](../../../README.md)  
> **Продукт (профиль, избранное, оплата, 18+):** [`../../../virtual-restaurant/docs/APP_LOGIC.md`](../../../virtual-restaurant/docs/APP_LOGIC.md) §8 · [`UX_SCREENS.md`](../../../virtual-restaurant/docs/UX_SCREENS.md) §13  
> **Runbook:** [`../../README.md`](../../README.md)

## Run

```bash
cd foodassistant/apps/mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2
```

`10.0.2.2` — host из Android Emulator. На устройстве укажите IP машины в LAN.

## Checks

```bash
flutter analyze
flutter test
```
