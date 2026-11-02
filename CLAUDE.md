# Cocos API

- Money is `Decimal`, never a JS number, and travels as decimal strings in JSON.
- Cash and holdings are derived from orders, never stored. The only order change is NEW to CANCELLED.
- Seed columns are lowercase, so Prisma needs `@map`.
