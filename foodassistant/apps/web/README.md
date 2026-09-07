# FoodAssistant Web (Next.js)

Публичный сайт, кабинет владельца, админ, discover.

> **Репозиторий:** [`../../../README.md`](../../../README.md)  
> **Документация:** [`../../../docs/README.md`](../../../docs/README.md)  
> **Runbook:** [`../../README.md`](../../README.md) · **Engineering:** [`../../../docs/ENGINEERING.md`](../../../docs/ENGINEERING.md)

## Local (без Docker)

```bash
cd foodassistant/apps/web
npm install
npm run dev
```

Обычно в стеке приложение слушает через Docker/Nginx на http://localhost/ (порт контейнера 3001). См. engineering guide.

## Scripts

```bash
npm run lint
npm test
npm run build
```
