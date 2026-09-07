# Documentation

All project documentation lives here. **Repository entry:** [`../README.md`](../README.md).

## Index

### Product (rules & UX)

| Document | Contents |
|----------|----------|
| [`APP_LOGIC.md`](./APP_LOGIC.md) | Business logic, auth, guest profile, alcohol/18+, payments, MVP |
| [`UX_SCREENS.md`](./UX_SCREENS.md) | Screens and navigation |
| [`I18N.md`](./I18N.md) | RU / EN / RO strings |
| [`RESTAURANT_OWNER_FLOW.md`](./RESTAURANT_OWNER_FLOW.md) | Owner onboarding & cabinet |
| [`TWENTY_CRM_INTEGRATION.md`](./TWENTY_CRM_INTEGRATION.md) | CRM sync rules |
| [`MAP_ARCHITECTURE.md`](./MAP_ARCHITECTURE.md) | MapLibre / OpenFreeMap |
| [`CHANGELOG.md`](./CHANGELOG.md) | Product docs / prototype history |

### Engineering

| Document | Contents |
|----------|----------|
| [`ENGINEERING.md`](./ENGINEERING.md) | Docker, API, CRM ops, tests, production |

### Assets

| Path | Contents |
|------|----------|
| [`prototype/index.html`](./prototype/index.html) | Clickable UX wireframe |
| [`diagrams/`](./diagrams/) | draw.io flow diagrams |
| [`superpowers/`](./superpowers/) | Agent specs & implementation plans |

### Code runbook (outside this folder)

| Document | Contents |
|----------|----------|
| [`../foodassistant/README.md`](../foodassistant/README.md) | Screenshots, demo checklist, Android/web pointers |

---

## Document vs prototype

| What | Where |
|------|--------|
| Business logic, auth, push, API fields | [`APP_LOGIC.md`](./APP_LOGIC.md) |
| Owner registration, moderation, cabinet | [`RESTAURANT_OWNER_FLOW.md`](./RESTAURANT_OWNER_FLOW.md) |
| CRM funnel & sync | [`TWENTY_CRM_INTEGRATION.md`](./TWENTY_CRM_INTEGRATION.md) |
| Map | [`MAP_ARCHITECTURE.md`](./MAP_ARCHITECTURE.md) |
| Screens / wireframes | [`UX_SCREENS.md`](./UX_SCREENS.md) |
| UI strings ru/en/ro | [`I18N.md`](./I18N.md) |
| Clickable demo | [`prototype/index.html`](./prototype/index.html) |
| Flow diagrams | [`diagrams/foodassistant.drawio`](./diagrams/foodassistant.drawio) |
| Docker / API / ops | [`ENGINEERING.md`](./ENGINEERING.md) |

Prototype may simplify UI; **logic is always fixed in these docs first**.

---

## Implemented product logic (summary)

### Navigation & auth
- Onboarding → city → map (pilot: Bălți)
- Bottom nav: QR + Map / Discover / Orders / Profile
- Auth required for booking, order, notify, “I’m coming”, favorites, history

### Guest profile (`APP_LOGIC` §8.3, `UX_SCREENS` §13)
- First name, last name, **preferred name** (`display_name`), phone, locale
- Allergies / diet, payment methods, favorites, order/booking history
- Alcohol / 18+: **staff-bound** ID check → `alcohol_preorder_allowed`; guest profile shows read-only status (who/when/venue). The **named waiter/manager** who granted is responsible if the guest was not actually 18+ — §8.4

### Floor / QR / alcohol
- Table states, notify when free, “I’m coming”, QR session
- Alcohol: in-session order OK with staff ID check; preorder only after staff grant — details in `APP_LOGIC` §8.4

---

## Quick open

```bash
# Prototype
open docs/prototype/index.html

# Diagrams → diagrams.net → File → Open → docs/diagrams/foodassistant.drawio
```

## Accepted product decisions

- Platform: mobile + web, one backend  
- Auth for booking / order / notify / “I’m coming”  
- Pay in-app or at venue  
- QR: walk-in and booking check-in  
- Geography: Bălți, Moldova (pilot)  
- Languages: ru, en, ro  
- Booking seat rules: session from −60 min, release −15 min (venue-configurable)  
