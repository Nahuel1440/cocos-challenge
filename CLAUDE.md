# Cocos API

- Money is `Decimal`, never a JS number, and travels as decimal strings in JSON.
- Cash and holdings are derived from orders, never stored. The only order change is NEW to CANCELLED.
- Seed columns are lowercase, so Prisma needs `@map`.
- No comments unless truly needed to explain a why the code cannot show. No references to tasks or decisions.
